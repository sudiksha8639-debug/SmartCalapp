import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);
  const [cycleInfo, setCycleInfo] = useState<any>(null);
  const [waterData, setWaterData] = useState<any>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load AI insights
      const insightsRes = await fetch(`${BACKEND_URL}/api/insights/daily`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (insightsRes.ok) {
        const data = await insightsRes.json();
        setInsights(data.insights || []);
      }

      // Load cycle info
      const cycleRes = await fetch(`${BACKEND_URL}/api/cycle/current`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (cycleRes.ok) {
        const data = await cycleRes.json();
        setCycleInfo(data);
      }

      // Load water tracking
      const waterRes = await fetch(`${BACKEND_URL}/api/water/logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (waterRes.ok) {
        const data = await waterRes.json();
        setWaterData(data);
      }
    } catch (error) {
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const logWater = async (amount: number) => {
    try {
      await fetch(`${BACKEND_URL}/api/water/log?amount_ml=${amount}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadDashboardData();
    } catch (error) {
      console.error('Water log error:', error);
    }
  };

  const getCyclePhaseInfo = () => {
    if (!cycleInfo || cycleInfo.phase === 'unknown') {
      return { icon: 'help-circle', color: '#9CA3AF', label: 'No cycle data' };
    }

    const phases: any = {
      menstrual: { icon: 'water', color: '#EF4444', label: 'Menstrual Phase' },
      follicular: { icon: 'flower', color: '#F59E0B', label: 'Follicular Phase' },
      ovulation: { icon: 'heart', color: '#EC4899', label: 'Ovulation Phase' },
      luteal: { icon: 'moon-waning-crescent', color: '#8B5CF6', label: 'Luteal Phase' },
    };

    return phases[cycleInfo.phase] || phases.menstrual;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  const phaseInfo = getCyclePhaseInfo();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name || 'there'}!</Text>
            <Text style={styles.date}>{format(new Date(), 'EEEE, MMMM d')}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/scanner')}>
            <MaterialCommunityIcons name="camera-plus" size={28} color="#10B981" />
          </TouchableOpacity>
        </View>

        {/* Cycle Phase Card */}
        {cycleInfo && cycleInfo.phase !== 'unknown' && (
          <View style={[styles.card, { borderLeftColor: phaseInfo.color, borderLeftWidth: 4 }]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name={phaseInfo.icon} size={24} color={phaseInfo.color} />
              <Text style={styles.cardTitle}>{phaseInfo.label}</Text>
            </View>
            <Text style={styles.cardText}>
              Day {cycleInfo.day} • {cycleInfo.days_until_next} days until next period
            </Text>
          </View>
        )}

        {/* Water Intake Card */}
        {waterData && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="water" size={24} color="#3B82F6" />
              <Text style={styles.cardTitle}>Water Intake</Text>
            </View>
            <View style={styles.waterProgress}>
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${Math.min(100, waterData.percentage)}%` },
                  ]}
                />
              </View>
              <Text style={styles.waterText}>
                {waterData.total_ml}ml / {waterData.goal_ml}ml
              </Text>
            </View>
            <View style={styles.waterButtons}>
              <TouchableOpacity
                style={styles.waterButton}
                onPress={() => logWater(250)}
              >
                <Text style={styles.waterButtonText}>+ 250ml</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.waterButton}
                onPress={() => logWater(500)}
              >
                <Text style={styles.waterButtonText}>+ 500ml</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.waterButton}
                onPress={() => logWater(1000)}
              >
                <Text style={styles.waterButtonText}>+ 1L</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* AI Insights */}
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="lightbulb" size={20} color="#10B981" />
          <Text style={styles.sectionTitle}>Today's Insights</Text>
        </View>
        {insights.length > 0 ? (
          insights.map((insight, index) => (
            <View key={index} style={styles.insightCard}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Track meals to get personalized insights</Text>
        )}

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="lightning-bolt" size={20} color="#10B981" />
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/scanner')}
          >
            <MaterialCommunityIcons name="camera" size={32} color="#10B981" />
            <Text style={styles.actionTitle}>Scan Menu</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/track')}
          >
            <MaterialCommunityIcons name="food" size={32} color="#F59E0B" />
            <Text style={styles.actionTitle}>Log Food</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/track')}
          >
            <MaterialCommunityIcons name="calendar-heart" size={32} color="#EC4899" />
            <Text style={styles.actionTitle}>Log Period</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/profile')}
          >
            <MaterialCommunityIcons name="account-cog" size={32} color="#8B5CF6" />
            <Text style={styles.actionTitle}>Profile</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  date: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  cardText: {
    fontSize: 14,
    color: '#6B7280',
  },
  waterProgress: {
    marginTop: 8,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  waterText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  waterButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  waterButton: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  waterButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  insightCard: {
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '48%',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
});
