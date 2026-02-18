import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, token, updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Basic Info
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  // Step 2: Cycle Info
  const [cycleLength, setCycleLength] = useState('28');
  const [lastPeriodDate, setLastPeriodDate] = useState('');
  const [hasPCOS, setHasPCOS] = useState(false);

  // Step 3: Diet & Lifestyle
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [budget, setBudget] = useState('medium');
  const [messInfo, setMessInfo] = useState('');
  const [activityLevel, setActivityLevel] = useState('moderate');

  const handleNext = () => {
    if (step === 1) {
      if (!age || !weight || !height) {
        Alert.alert('Error', 'Please fill in all fields');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const onboardingData = {
        age: parseInt(age),
        weight: parseFloat(weight),
        height: parseFloat(height),
        cycle_length: parseInt(cycleLength),
        last_period_date: lastPeriodDate || null,
        has_pcos: hasPCOS,
        dietary_restrictions: dietaryRestrictions,
        budget,
        mess_info: messInfo,
        activity_level: activityLevel,
      };

      const response = await fetch(`${BACKEND_URL}/api/profile/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(onboardingData),
      });

      if (response.ok) {
        const updatedUser = await response.json();
        updateUser(updatedUser);
        router.replace('/(tabs)');
      } else {
        Alert.alert('Error', 'Failed to save profile');
      }
    } catch (error) {
      console.error('Onboarding error:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const toggleDietaryRestriction = (restriction: string) => {
    setDietaryRestrictions(prev =>
      prev.includes(restriction)
        ? prev.filter(r => r !== restriction)
        : [...prev, restriction]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
          </View>
          <Text style={styles.stepText}>Step {step} of 3</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {step === 1 && (
            <View style={styles.stepContainer}>
              <MaterialCommunityIcons name="account-details" size={48} color="#10B981" />
              <Text style={styles.stepTitle}>Basic Information</Text>
              <Text style={styles.stepSubtitle}>
                Help us personalize your health recommendations
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Age</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your age"
                  value={age}
                  onChangeText={setAge}
                  keyboardType="number-pad"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your weight"
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Height (cm)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your height"
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepContainer}>
              <MaterialCommunityIcons name="calendar-heart" size={48} color="#10B981" />
              <Text style={styles.stepTitle}>Menstrual Cycle Info</Text>
              <Text style={styles.stepSubtitle}>
                For cycle-aware nutrition recommendations
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Average Cycle Length (days)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="28"
                  value={cycleLength}
                  onChangeText={setCycleLength}
                  keyboardType="number-pad"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Last Period Start Date (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={lastPeriodDate}
                  onChangeText={setLastPeriodDate}
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.hint}>Format: 2025-01-15</Text>
              </View>

              <View style={styles.inputGroup}>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setHasPCOS(!hasPCOS)}
                >
                  <View style={[styles.checkbox, hasPCOS && styles.checkboxChecked]}>
                    {hasPCOS && (
                      <MaterialCommunityIcons name="check" size={16} color="white" />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>I have PCOS</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepContainer}>
              <MaterialCommunityIcons name="food-variant" size={48} color="#10B981" />
              <Text style={styles.stepTitle}>Diet & Lifestyle</Text>
              <Text style={styles.stepSubtitle}>
                Help us suggest feasible meals for you
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Dietary Restrictions</Text>
                <View style={styles.chipContainer}>
                  {['Vegetarian', 'Vegan', 'Lactose Intolerant', 'Gluten Free'].map(
                    restriction => (
                      <TouchableOpacity
                        key={restriction}
                        style={[
                          styles.chip,
                          dietaryRestrictions.includes(restriction) && styles.chipSelected,
                        ]}
                        onPress={() => toggleDietaryRestriction(restriction)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            dietaryRestrictions.includes(restriction) &&
                              styles.chipTextSelected,
                          ]}
                        >
                          {restriction}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Monthly Food Budget</Text>
                <View style={styles.radioGroup}>
                  {[
                    { value: 'low', label: 'Low (< ₹3000)' },
                    { value: 'medium', label: 'Medium (₹3000-6000)' },
                    { value: 'high', label: 'High (> ₹6000)' },
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={styles.radioOption}
                      onPress={() => setBudget(option.value)}
                    >
                      <View
                        style={[
                          styles.radio,
                          budget === option.value && styles.radioSelected,
                        ]}
                      >
                        {budget === option.value && (
                          <View style={styles.radioInner} />
                        )}
                      </View>
                      <Text style={styles.radioLabel}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mess/Hostel Info (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., College hostel mess"
                  value={messInfo}
                  onChangeText={setMessInfo}
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Activity Level</Text>
                <View style={styles.radioGroup}>
                  {[
                    { value: 'low', label: 'Low (Mostly sitting)' },
                    { value: 'moderate', label: 'Moderate (Some exercise)' },
                    { value: 'high', label: 'High (Active lifestyle)' },
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={styles.radioOption}
                      onPress={() => setActivityLevel(option.value)}
                    >
                      <View
                        style={[
                          styles.radio,
                          activityLevel === option.value && styles.radioSelected,
                        ]}
                      >
                        {activityLevel === option.value && (
                          <View style={styles.radioInner} />
                        )}
                      </View>
                      <Text style={styles.radioLabel}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(step - 1)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.nextButton, step === 1 && styles.nextButtonFull]}
            onPress={step === 3 ? handleComplete : handleNext}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.nextButtonText}>
                {step === 3 ? 'Complete' : 'Next'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  stepText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 0,
  },
  stepContainer: {
    alignItems: 'center',
    gap: 16,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#111827',
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#374151',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipSelected: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
  },
  chipTextSelected: {
    color: 'white',
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: '#10B981',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  radioLabel: {
    fontSize: 16,
    color: '#374151',
  },
  footer: {
    flexDirection: 'row',
    padding: 24,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  backButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  nextButton: {
    flex: 2,
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonFull: {
    flex: 1,
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
