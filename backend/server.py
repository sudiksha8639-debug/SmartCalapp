from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import bcrypt
import jose
from jose import jwt
import base64
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Settings
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# Emergent LLM Key
EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============= MODELS =============

class User(BaseModel):
    user_id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    # Health profile
    age: Optional[int] = None
    weight: Optional[float] = None  # in kg
    height: Optional[float] = None  # in cm
    cycle_length: Optional[int] = 28  # days
    last_period_date: Optional[datetime] = None
    has_pcos: bool = False
    dietary_restrictions: List[str] = Field(default_factory=list)
    budget: Optional[str] = None  # low, medium, high
    mess_info: Optional[str] = None
    activity_level: Optional[str] = "moderate"  # low, moderate, high
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class OnboardingData(BaseModel):
    age: int
    weight: float
    height: float
    cycle_length: int = 28
    last_period_date: Optional[datetime] = None
    has_pcos: bool = False
    dietary_restrictions: List[str] = Field(default_factory=list)
    budget: str = "medium"
    mess_info: Optional[str] = None
    activity_level: str = "moderate"

class FoodLog(BaseModel):
    log_id: str = Field(default_factory=lambda: f"log_{uuid.uuid4().hex[:12]}")
    user_id: str
    date: str  # YYYY-MM-DD format
    meal_type: str  # breakfast, lunch, dinner, snacks
    items: List[Dict[str, Any]]  # [{name, quantity, calories, protein, carbs, fat}]
    total_calories: float = 0
    total_protein: float = 0
    total_carbs: float = 0
    total_fat: float = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WaterLog(BaseModel):
    log_id: str = Field(default_factory=lambda: f"water_{uuid.uuid4().hex[:12]}")
    user_id: str
    date: str
    amount_ml: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CycleLog(BaseModel):
    log_id: str = Field(default_factory=lambda: f"cycle_{uuid.uuid4().hex[:12]}")
    user_id: str
    start_date: datetime
    end_date: Optional[datetime] = None
    flow_intensity: Optional[str] = None  # light, medium, heavy
    symptoms: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessMenu(BaseModel):
    menu_id: str = Field(default_factory=lambda: f"menu_{uuid.uuid4().hex[:12]}")
    user_id: str
    date: str
    image_base64: str
    parsed_items: List[Dict[str, Any]] = Field(default_factory=list)
    ai_analysis: Optional[Dict[str, Any]] = None
    recommendations: List[str] = Field(default_factory=list)
    saved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AIInsight(BaseModel):
    insight_id: str = Field(default_factory=lambda: f"insight_{uuid.uuid4().hex[:12]}")
    user_id: str
    insight_type: str  # pattern, recommendation, prediction, warning
    content: str
    confidence: float = 0.8
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============= AUTH HELPERS =============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user_from_token(authorization: Optional[str] = Header(None), request: Request = None) -> Optional[User]:
    logging.info(f"get_current_user_from_token called: auth={authorization is not None}, request={request is not None}")
    
    # Try to get session_token from cookie first
    session_token = None
    if request:
        session_token = request.cookies.get("session_token")
    
    # Fallback to Authorization header
    if not session_token and authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            session_token = parts[1]
    
    logging.info(f"Session token extracted: {session_token[:20] if session_token else 'None'}...")
    
    if not session_token:
        logging.error("No session token found")
        return None
    
    # Check if it's an Emergent session token (starts with eme_ prefix)
    if session_token.startswith("eme_"):
        logging.info("Token identified as Emergent session token")
        session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if not session:
            logging.error("Session not found in database")
            return None
        
        # Check expiry with timezone awareness
        expires_at = session["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if expires_at < datetime.now(timezone.utc):
            logging.error("Session expired")
            return None
        
        user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if user_doc:
            return User(**user_doc)
    else:
        logging.info("Token identified as JWT token")
        # It's a JWT token
        try:
            payload = jwt.decode(session_token, SECRET_KEY, algorithms=[ALGORITHM])
            logging.info(f"JWT decoded successfully: {payload}")
            user_id = payload.get("sub")
            if not user_id:
                logging.error("No user_id in JWT payload")
                return None
            
            user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            logging.info(f"User doc found: {user_doc is not None}")
            if user_doc:
                try:
                    user_obj = User(**user_doc)
                    logging.info(f"User object created successfully for {user_id}")
                    return user_obj
                except Exception as e:
                    logging.error(f"Failed to create User object: {e}")
                    return None
            else:
                logging.error(f"User not found in database: {user_id}")
        except jose.exceptions.JWTError as e:
            logging.error(f"JWT decode error: {e}")
            return None
        except Exception as e:
            logging.error(f"Unexpected error in auth: {e}")
            import traceback
            logging.error(traceback.format_exc())
            return None
    
    return None

async def require_auth(authorization: Optional[str] = Header(None), request: Request = None) -> User:
    user = await get_current_user_from_token(authorization, request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# ============= AUTH ROUTES =============

@api_router.post("/auth/register")
async def register(data: RegisterRequest, response: Response):
    # Check if user exists
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_pw = hash_password(data.password)
    
    user_doc = {
        "user_id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": hashed_pw,
        "picture": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(user_doc)
    
    # Create JWT token
    access_token = create_access_token({"sub": user_id})
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/"
    )
    
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return {"user": user_doc, "token": access_token}

@api_router.post("/auth/login")
async def login(data: LoginRequest, response: Response):
    user_doc = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user_doc or not verify_password(data.password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create JWT token
    access_token = create_access_token({"sub": user_doc["user_id"]})
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/"
    )
    
    user_doc.pop("password_hash", None)
    return {"user": user_doc, "token": access_token}

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(require_auth)):
    return current_user

@api_router.get("/auth/google")
async def google_auth(redirect_url: str):
    auth_url = f"https://auth.emergentagent.com/?redirect={redirect_url}"
    return {"auth_url": auth_url}

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    
    # Call Emergent auth API
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            resp.raise_for_status()
            user_data = resp.json()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid session: {str(e)}")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data["email"]}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": user_data["email"],
            "name": user_data.get("name", ""),
            "picture": user_data.get("picture"),
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(new_user)
    
    # Store session
    session_token = user_data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/"
    )
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user_doc.pop("password_hash", None)
    return {"user": user_doc, "token": session_token}

@api_router.post("/auth/logout")
async def logout(response: Response, current_user: User = Depends(require_auth)):
    response.delete_cookie(key="session_token", path="/")
    await db.user_sessions.delete_many({"user_id": current_user.user_id})
    return {"message": "Logged out"}

@api_router.post("/auth/guest")
async def create_guest():
    user_id = f"guest_{uuid.uuid4().hex[:12]}"
    
    # Create guest user document in database
    guest_user = {
        "user_id": user_id,
        "email": f"{user_id}@example.com",  # Use example.com which is valid
        "name": "Guest User",
        "picture": None,
        "created_at": datetime.now(timezone.utc)
    }
    await db.users.insert_one(guest_user)
    
    guest_token = create_access_token({"sub": user_id, "guest": True})
    return {"user_id": user_id, "token": guest_token, "is_guest": True}

# ============= USER PROFILE =============

@api_router.post("/profile/onboarding")
async def complete_onboarding(data: OnboardingData, current_user: User = Depends(require_auth)):
    update_data = data.dict()
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": update_data}
    )
    
    updated_user = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    updated_user.pop("password_hash", None)
    return updated_user

@api_router.get("/profile")
async def get_profile(current_user: User = Depends(require_auth)):
    return current_user

@api_router.put("/profile")
async def update_profile(updates: Dict[str, Any], current_user: User = Depends(require_auth)):
    # Remove fields that shouldn't be updated
    updates.pop("user_id", None)
    updates.pop("email", None)
    updates.pop("created_at", None)
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": updates}
    )
    
    updated_user = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    updated_user.pop("password_hash", None)
    return updated_user

# ============= MESS MENU SCANNER =============

@api_router.post("/menu/scan")
async def scan_menu(request: Request, current_user: User = Depends(require_auth)):
    data = await request.json()
    image_base64 = data.get("image_base64")
    date = data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    
    if not image_base64:
        raise HTTPException(status_code=400, detail="No image provided")
    
    # Remove data URL prefix if present
    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]
    
    # Use OpenAI Vision to analyze the menu
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"menu_scan_{current_user.user_id}_{datetime.now().timestamp()}",
            system_message="You are a nutrition expert analyzing Indian mess/cafeteria menus. Extract all food items and provide nutritional analysis."
        ).with_model("openai", "gpt-5.2")
        
        image_content = ImageContent(image_base64=image_base64)
        
        user_message = UserMessage(
            text="""Analyze this mess menu image and provide:
1. List all food items visible in the menu
2. For each item, estimate: calories, protein, carbs, fat content per standard serving
3. Identify items that are: high-iron, high-protein, high-carb, high-sodium
4. Overall nutritional balance assessment

Format response as JSON with structure:
{
  "items": [{"name": "...", "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "tags": []}],
  "highlights": {"high_iron": [], "high_protein": [], "balanced": []},
  "overall_balance": "description"
}""",
            file_contents=[image_content]
        )
        
        ai_response = await chat.send_message(user_message)
        
        # Parse AI response (try to extract JSON)
        import json
        try:
            # Try to find JSON in response
            response_text = ai_response
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0].strip()
            else:
                json_str = response_text
            
            parsed_analysis = json.loads(json_str)
        except:
            # If parsing fails, create a simple structure
            parsed_analysis = {
                "items": [],
                "highlights": {},
                "overall_balance": ai_response[:200]
            }
        
        # Generate personalized recommendations based on user profile
        recommendations = await generate_menu_recommendations(current_user, parsed_analysis)
        
        # Save to database
        menu_doc = {
            "menu_id": f"menu_{uuid.uuid4().hex[:12]}",
            "user_id": current_user.user_id,
            "date": date,
            "image_base64": image_base64,
            "parsed_items": parsed_analysis.get("items", []),
            "ai_analysis": parsed_analysis,
            "recommendations": recommendations,
            "saved_at": datetime.now(timezone.utc)
        }
        
        await db.mess_menus.insert_one(menu_doc)
        menu_doc.pop("_id", None)
        
        return menu_doc
        
    except Exception as e:
        logging.error(f"Menu scan error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze menu: {str(e)}")

async def generate_menu_recommendations(user: User, menu_analysis: Dict) -> List[str]:
    recommendations = []
    
    items = menu_analysis.get("items", [])
    highlights = menu_analysis.get("highlights", {})
    
    # Check if user is in menstrual phase
    if user.last_period_date:
        days_since = (datetime.now(timezone.utc) - user.last_period_date).days
        cycle_day = days_since % (user.cycle_length or 28)
        
        if cycle_day <= 5:
            # Menstrual phase - need iron
            if highlights.get("high_iron"):
                recommendations.append(f"🩸 You're in menstrual phase - prioritize: {', '.join(highlights['high_iron'][:2])}")
            else:
                recommendations.append("🩸 Menstrual phase detected - add iron-rich foods like spinach or dates")
        elif 19 <= cycle_day <= 28:
            # Luteal phase - reduce sodium for bloating
            recommendations.append("🌙 Luteal phase - avoid high-sodium foods to reduce bloating")
    
    # Check protein intake
    total_protein = sum(item.get("protein", 0) for item in items)
    if total_protein < 15:
        recommendations.append("💪 Low protein meal - add peanuts, curd, or boiled eggs")
    
    # Budget-friendly suggestion
    if user.budget == "low":
        recommendations.append("💰 Budget tip: Combine dal and rice for complete protein")
    
    # Balanced meal check
    if highlights.get("balanced"):
        recommendations.append(f"✅ Well-balanced options: {', '.join(highlights['balanced'][:2])}")
    
    return recommendations[:4]  # Limit to 4 recommendations

@api_router.get("/menu/history")
async def get_menu_history(current_user: User = Depends(require_auth)):
    menus = await db.mess_menus.find(
        {"user_id": current_user.user_id},
        {"_id": 0, "image_base64": 0}  # Exclude large image data
    ).sort("saved_at", -1).limit(30).to_list(30)
    return menus

@api_router.get("/menu/{menu_id}")
async def get_menu_detail(menu_id: str, current_user: User = Depends(require_auth)):
    menu = await db.mess_menus.find_one(
        {"menu_id": menu_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    return menu

# ============= FOOD LOGGING =============

@api_router.post("/food/log")
async def log_food(log_data: Dict[str, Any], current_user: User = Depends(require_auth)):
    food_log = {
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "user_id": current_user.user_id,
        "date": log_data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "meal_type": log_data["meal_type"],
        "items": log_data["items"],
        "total_calories": sum(item.get("calories", 0) for item in log_data["items"]),
        "total_protein": sum(item.get("protein", 0) for item in log_data["items"]),
        "total_carbs": sum(item.get("carbs", 0) for item in log_data["items"]),
        "total_fat": sum(item.get("fat", 0) for item in log_data["items"]),
        "timestamp": datetime.now(timezone.utc)
    }
    
    await db.food_logs.insert_one(food_log)
    food_log.pop("_id", None)
    return food_log

@api_router.get("/food/logs")
async def get_food_logs(date: Optional[str] = None, current_user: User = Depends(require_auth)):
    query = {"user_id": current_user.user_id}
    if date:
        query["date"] = date
    
    logs = await db.food_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(100).to_list(100)
    return logs

@api_router.delete("/food/log/{log_id}")
async def delete_food_log(log_id: str, current_user: User = Depends(require_auth)):
    result = await db.food_logs.delete_one({"log_id": log_id, "user_id": current_user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")
    return {"message": "Deleted"}

# ============= WATER TRACKING =============

@api_router.post("/water/log")
async def log_water(amount_ml: int, current_user: User = Depends(require_auth)):
    water_log = {
        "log_id": f"water_{uuid.uuid4().hex[:12]}",
        "user_id": current_user.user_id,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "amount_ml": amount_ml,
        "timestamp": datetime.now(timezone.utc)
    }
    
    await db.water_logs.insert_one(water_log)
    water_log.pop("_id", None)
    return water_log

@api_router.get("/water/logs")
async def get_water_logs(date: Optional[str] = None, current_user: User = Depends(require_auth)):
    query = {"user_id": current_user.user_id}
    if date:
        query["date"] = date
    else:
        query["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    logs = await db.water_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(100)
    total = sum(log["amount_ml"] for log in logs)
    
    # Calculate personalized goal
    goal = calculate_water_goal(current_user)
    
    return {
        "logs": logs,
        "total_ml": total,
        "goal_ml": goal,
        "percentage": min(100, int((total / goal) * 100)) if goal > 0 else 0
    }

def calculate_water_goal(user: User) -> int:
    # Base calculation: 30ml per kg of body weight
    base_goal = int((user.weight or 60) * 30)
    
    # Adjust for activity level
    if user.activity_level == "high":
        base_goal = int(base_goal * 1.3)
    elif user.activity_level == "low":
        base_goal = int(base_goal * 0.9)
    
    # Adjust for menstrual cycle
    if user.last_period_date:
        days_since = (datetime.now(timezone.utc) - user.last_period_date).days
        cycle_day = days_since % (user.cycle_length or 28)
        
        if cycle_day <= 5:  # Menstrual phase - increase hydration
            base_goal = int(base_goal * 1.15)
    
    return base_goal

# ============= CYCLE TRACKING =============

@api_router.post("/cycle/log")
async def log_cycle(log_data: Dict[str, Any], current_user: User = Depends(require_auth)):
    cycle_log = {
        "log_id": f"cycle_{uuid.uuid4().hex[:12]}",
        "user_id": current_user.user_id,
        "start_date": datetime.fromisoformat(log_data["start_date"].replace("Z", "+00:00")),
        "end_date": datetime.fromisoformat(log_data["end_date"].replace("Z", "+00:00")) if log_data.get("end_date") else None,
        "flow_intensity": log_data.get("flow_intensity"),
        "symptoms": log_data.get("symptoms", []),
        "notes": log_data.get("notes"),
        "timestamp": datetime.now(timezone.utc)
    }
    
    await db.cycle_logs.insert_one(cycle_log)
    
    # Update last_period_date in user profile
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"last_period_date": cycle_log["start_date"]}}
    )
    
    cycle_log.pop("_id", None)
    cycle_log["start_date"] = cycle_log["start_date"].isoformat()
    if cycle_log["end_date"]:
        cycle_log["end_date"] = cycle_log["end_date"].isoformat()
    
    return cycle_log

@api_router.get("/cycle/logs")
async def get_cycle_logs(current_user: User = Depends(require_auth)):
    logs = await db.cycle_logs.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("start_date", -1).limit(12).to_list(12)
    
    for log in logs:
        log["start_date"] = log["start_date"].isoformat()
        if log.get("end_date"):
            log["end_date"] = log["end_date"].isoformat()
    
    return logs

@api_router.get("/cycle/current")
async def get_current_cycle_info(current_user: User = Depends(require_auth)):
    if not current_user.last_period_date:
        return {"phase": "unknown", "day": 0, "next_period": None}
    
    days_since = (datetime.now(timezone.utc) - current_user.last_period_date).days
    cycle_day = (days_since % (current_user.cycle_length or 28)) + 1
    
    # Determine phase
    if cycle_day <= 5:
        phase = "menstrual"
    elif cycle_day <= 13:
        phase = "follicular"
    elif cycle_day <= 16:
        phase = "ovulation"
    else:
        phase = "luteal"
    
    # Calculate next period
    days_until_next = (current_user.cycle_length or 28) - cycle_day
    next_period = datetime.now(timezone.utc) + timedelta(days=days_until_next)
    
    return {
        "phase": phase,
        "day": cycle_day,
        "days_until_next": days_until_next,
        "next_period": next_period.strftime("%Y-%m-%d")
    }

# ============= EXAM MODE =============

@api_router.post("/profile/exam-mode")
async def set_exam_mode(exam_data: Dict[str, Any], current_user: User = Depends(require_auth)):
    """Set exam mode with start and end dates"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {
            "exam_mode": True,
            "exam_start_date": datetime.fromisoformat(exam_data["start_date"].replace("Z", "+00:00")),
            "exam_end_date": datetime.fromisoformat(exam_data["end_date"].replace("Z", "+00:00"))
        }}
    )
    return {"message": "Exam mode activated", "recommendations": [
        "Focus on brain-boosting foods: walnuts, blueberries, dark chocolate",
        "Stay hydrated - aim for 2.5L water daily",
        "Avoid heavy meals before studying - opt for light snacks",
        "Include omega-3 rich foods: fish, chia seeds, flaxseeds"
    ]}

@api_router.delete("/profile/exam-mode")
async def disable_exam_mode(current_user: User = Depends(require_auth)):
    """Disable exam mode"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"exam_mode": False}}
    )
    return {"message": "Exam mode disabled"}

# ============= PATTERN DETECTION =============

@api_router.get("/patterns/analyze")
async def analyze_patterns(current_user: User = Depends(require_auth)):
    """Analyze patterns in food, cycle, and symptoms data"""
    try:
        # Get last 30 days of data
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        
        food_logs = await db.food_logs.find(
            {"user_id": current_user.user_id, "timestamp": {"$gte": thirty_days_ago}},
            {"_id": 0}
        ).to_list(1000)
        
        cycle_logs = await db.cycle_logs.find(
            {"user_id": current_user.user_id},
            {"_id": 0}
        ).sort("start_date", -1).limit(3).to_list(3)
        
        # Analyze patterns with AI
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"pattern_{current_user.user_id}_{datetime.now().timestamp()}",
            system_message="You are a health pattern analyst specializing in detecting correlations between food, menstrual cycles, and symptoms."
        ).with_model("openai", "gpt-5.2")
        
        prompt = f"""Analyze health patterns for an Indian college student:

User Profile:
- Age: {current_user.age}
- PCOS: {current_user.has_pcos}
- Dietary: {', '.join(current_user.dietary_restrictions or [])}

Recent Food Logs: {len(food_logs)} meals logged
Recent Cycle Data: {len(cycle_logs)} cycles tracked

Detect patterns and provide insights in JSON format:
{{
  "detected_patterns": ["pattern 1", "pattern 2"],
  "food_symptom_correlations": ["correlation 1"],
  "cycle_food_patterns": ["pattern 1"],
  "recommendations": ["actionable recommendation 1"]
}}

Focus on:
1. Food choices during different cycle phases
2. Symptoms that correlate with specific foods
3. Eating patterns (timing, frequency, portions)
4. Nutritional gaps or excesses"""
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse response
        import json
        try:
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            else:
                json_str = response
            
            patterns = json.loads(json_str)
        except:
            patterns = {
                "detected_patterns": ["Track more meals for better pattern detection"],
                "food_symptom_correlations": [],
                "cycle_food_patterns": [],
                "recommendations": ["Log meals consistently for 2 weeks to detect patterns"]
            }
        
        return patterns
        
    except Exception as e:
        logging.error(f"Pattern analysis error: {str(e)}")
        return {
            "detected_patterns": [],
            "food_symptom_correlations": [],
            "cycle_food_patterns": [],
            "recommendations": ["Keep tracking to enable pattern detection"]
        }

# ============= DIGESTIVE PREDICTION =============

@api_router.post("/predict/digestion")
async def predict_digestion(meal_data: Dict[str, Any], current_user: User = Depends(require_auth)):
    """Predict indigestion probability for a planned meal"""
    try:
        # Get cycle info
        cycle_info_data = await get_current_cycle_info(current_user)
        
        # Get recent symptom history
        recent_cycles = await db.cycle_logs.find(
            {"user_id": current_user.user_id},
            {"_id": 0}
        ).sort("start_date", -1).limit(3).to_list(3)
        
        common_symptoms = []
        for cycle in recent_cycles:
            common_symptoms.extend(cycle.get("symptoms", []))
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"digestion_{current_user.user_id}_{datetime.now().timestamp()}",
            system_message="You are a digestive health predictor for Indian women."
        ).with_model("gemini", "gemini-3-flash-preview")
        
        prompt = f"""Predict digestion risk for this meal:

Meal: {meal_data.get('meal_description', 'Not specified')}
Meal Type: {meal_data.get('meal_type', 'snack')}

User Context:
- Current cycle phase: {cycle_info_data.get('phase', 'unknown')}
- Cycle day: {cycle_info_data.get('day', 0)}
- PCOS: {current_user.has_pcos}
- Common symptoms: {', '.join(set(common_symptoms[:10]))}

Provide prediction in JSON:
{{
  "risk_level": "low/medium/high",
  "risk_percentage": 0-100,
  "risk_factors": ["factor 1", "factor 2"],
  "safer_alternatives": ["alternative 1", "alternative 2"],
  "tips": ["tip 1", "tip 2"]
}}"""
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        import json
        try:
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            else:
                json_str = response
            
            prediction = json.loads(json_str)
        except:
            prediction = {
                "risk_level": "medium",
                "risk_percentage": 50,
                "risk_factors": ["Unable to analyze - track more meals"],
                "safer_alternatives": [],
                "tips": ["Listen to your body"]
            }
        
        return prediction
        
    except Exception as e:
        logging.error(f"Digestion prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============= ANEMIA RISK PREDICTOR =============

@api_router.get("/health/anemia-risk")
async def get_anemia_risk(current_user: User = Depends(require_auth)):
    """Calculate anemia risk score based on iron intake and fatigue patterns"""
    try:
        # Get last 14 days of food logs
        fourteen_days_ago = datetime.now(timezone.utc) - timedelta(days=14)
        
        food_logs = await db.food_logs.find(
            {"user_id": current_user.user_id, "timestamp": {"$gte": fourteen_days_ago}},
            {"_id": 0}
        ).to_list(1000)
        
        # Get cycle data to check for heavy flow
        recent_cycles = await db.cycle_logs.find(
            {"user_id": current_user.user_id},
            {"_id": 0}
        ).sort("start_date", -1).limit(3).to_list(3)
        
        heavy_flow_count = sum(1 for c in recent_cycles if c.get("flow_intensity") == "heavy")
        fatigue_mentions = sum(1 for c in recent_cycles if "Fatigue" in c.get("symptoms", []))
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"anemia_{current_user.user_id}_{datetime.now().timestamp()}",
            system_message="You are an anemia risk assessment specialist for young women in India."
        ).with_model("openai", "gpt-5.2")
        
        prompt = f"""Assess anemia risk:

User Profile:
- Age: {current_user.age}
- Recent meals logged: {len(food_logs)}
- Heavy menstrual flow (last 3 cycles): {heavy_flow_count}
- Fatigue reported: {fatigue_mentions} times
- Dietary restrictions: {', '.join(current_user.dietary_restrictions or ['None'])}

Provide assessment in JSON:
{{
  "risk_score": 0-100,
  "risk_level": "low/moderate/high",
  "risk_factors": ["factor 1", "factor 2"],
  "iron_rich_foods": ["affordable food 1", "affordable food 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "warning_signs": ["sign 1", "sign 2"],
  "should_consult_doctor": true/false
}}

Focus on affordable, accessible foods for Indian college students."""
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        import json
        try:
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            else:
                json_str = response
            
            assessment = json.loads(json_str)
        except:
            assessment = {
                "risk_score": 30,
                "risk_level": "moderate",
                "risk_factors": ["Limited data available"],
                "iron_rich_foods": ["Spinach", "Dates", "Jaggery", "Lentils"],
                "recommendations": ["Track meals for better assessment"],
                "warning_signs": ["Persistent fatigue", "Dizziness", "Pale skin"],
                "should_consult_doctor": False
            }
        
        return assessment
        
    except Exception as e:
        logging.error(f"Anemia risk assessment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============= CAUSAL PATTERN DETECTION =============

@api_router.get("/patterns/weight-analysis")
async def analyze_weight_changes(current_user: User = Depends(require_auth)):
    """Explain weight changes with causal analysis"""
    try:
        # Get recent data
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        
        food_logs = await db.food_logs.find(
            {"user_id": current_user.user_id, "timestamp": {"$gte": seven_days_ago}},
            {"_id": 0}
        ).to_list(1000)
        
        water_logs = await db.water_logs.find(
            {"user_id": current_user.user_id, "timestamp": {"$gte": seven_days_ago}},
            {"_id": 0}
        ).to_list(1000)
        
        cycle_info = await get_current_cycle_info(current_user)
        
        # Calculate averages
        avg_calories = sum(log.get("total_calories", 0) for log in food_logs) / max(len(food_logs), 1)
        avg_sodium = sum(sum(item.get("sodium", 0) for item in log.get("items", [])) for log in food_logs) / max(len(food_logs), 1)
        avg_water = sum(log.get("amount_ml", 0) for log in water_logs) / 7
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"weight_{current_user.user_id}_{datetime.now().timestamp()}",
            system_message="You are a health analyst explaining weight fluctuations to young women."
        ).with_model("gemini", "gemini-3-flash-preview")
        
        prompt = f"""Explain potential weight changes:

Current Context:
- Cycle phase: {cycle_info.get('phase', 'unknown')}
- Cycle day: {cycle_info.get('day', 0)}
- Average daily calories: {avg_calories:.0f}
- Average daily water: {avg_water:.0f}ml
- High sodium intake: {avg_sodium > 2000}

Provide explanation in JSON:
{{
  "primary_cause": "Main reason for weight change",
  "contributing_factors": ["factor 1", "factor 2"],
  "is_water_retention": true/false,
  "is_hormonal": true/false,
  "is_dietary": true/false,
  "explanation": "Simple explanation in 2-3 sentences",
  "action_items": ["what to do 1", "what to do 2"]
}}"""
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        import json
        try:
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            else:
                json_str = response
            
            analysis = json.loads(json_str)
        except:
            analysis = {
                "primary_cause": "Multiple factors",
                "contributing_factors": ["Menstrual cycle phase", "Water retention"],
                "is_water_retention": True,
                "is_hormonal": True,
                "is_dietary": False,
                "explanation": "Weight fluctuations are normal, especially during different cycle phases.",
                "action_items": ["Track consistently for better insights"]
            }
        
        return analysis
        
    except Exception as e:
        logging.error(f"Weight analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============= AI INSIGHTS =============

@api_router.get("/insights/daily")
async def get_daily_insights(current_user: User = Depends(require_auth)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Get today's data
    food_logs = await db.food_logs.find(
        {"user_id": current_user.user_id, "date": today},
        {"_id": 0}
    ).to_list(100)
    
    water_logs = await db.water_logs.find(
        {"user_id": current_user.user_id, "date": today},
        {"_id": 0}
    ).to_list(100)
    
    # Get cycle info
    cycle_info = await get_current_cycle_info(current_user)
    
    # Generate insights using AI
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"insights_{current_user.user_id}_{datetime.now().timestamp()}",
            system_message="You are a health and nutrition AI assistant for Indian college students."
        ).with_model("gemini", "gemini-3-flash-preview")
        
        total_calories = sum(log.get("total_calories", 0) for log in food_logs)
        total_protein = sum(log.get("total_protein", 0) for log in food_logs)
        total_water = sum(log.get("amount_ml", 0) for log in water_logs)
        water_goal = calculate_water_goal(current_user)
        
        prompt = f"""Generate 3-4 personalized health insights for a college student:

User Profile:
- Age: {current_user.age}
- Weight: {current_user.weight}kg
- Menstrual cycle phase: {cycle_info['phase']}
- Has PCOS: {current_user.has_pcos}

Today's Data:
- Total calories: {total_calories}
- Total protein: {total_protein}g
- Water intake: {total_water}ml / {water_goal}ml goal
- Meals logged: {len(food_logs)}

Provide insights as a JSON array of strings. Each insight should be:
- Actionable and specific
- Relevant to menstrual cycle phase
- Consider PCOS if applicable
- Culturally appropriate for Indian students

Example format: ["insight 1", "insight 2", "insight 3"]"""
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse response
        import json
        try:
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            else:
                json_str = response
            
            insights = json.loads(json_str)
            if not isinstance(insights, list):
                insights = [str(insights)]
        except:
            insights = [
                "Keep tracking your meals to build healthy patterns!",
                f"You're in {cycle_info['phase']} phase - listen to your body's needs",
                "Stay hydrated throughout the day"
            ]
        
        return {"insights": insights[:4], "generated_at": datetime.now(timezone.utc).isoformat()}
        
    except Exception as e:
        logging.error(f"Insights generation error: {str(e)}")
        # Return fallback insights
        return {
            "insights": [
                "Track your meals consistently for better health insights",
                f"You're in {cycle_info['phase']} phase - adjust nutrition accordingly",
                "Stay hydrated and maintain regular meal times"
            ],
            "generated_at": datetime.now(timezone.utc).isoformat()
        }

@api_router.get("/")
async def root():
    return {"message": "Healthcare App API", "version": "1.0.0"}

@api_router.get("/debug/test-jwt")
async def test_jwt_debug(authorization: Optional[str] = Header(None)):
    """Debug endpoint to test JWT parsing"""
    import traceback
    if not authorization:
        return {"error": "No authorization header"}
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return {"error": "Invalid authorization format"}
    
    token = parts[1]
    
    try:
        from jose import jwt
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        
        return {
            "token_received": token[:20] + "...",
            "payload": payload,
            "user_found": user_doc is not None,
            "user_email": user_doc.get("email") if user_doc else None
        }
    except Exception as e:
        return {
            "error": str(e),
            "traceback": traceback.format_exc()
        }


# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
