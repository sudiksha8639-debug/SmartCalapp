import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function TrackScreen() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'food' | 'cycle'>('food');
  const [showFoodModal, setShowFoodModal] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Track</Text>
        <Text style={styles.headerSubtitle}>Log your meals and cycle</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'food' && styles.tabActive]}
          onPress={() => setActiveTab('food')}
        >
          <MaterialCommunityIcons
            name="food"
            size={20}
            color={activeTab === 'food' ? '#10B981' : '#9CA3AF'}
          />
          <Text style={[styles.tabText, activeTab === 'food' && styles.tabTextActive]}>
            Food
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'cycle' && styles.tabActive]}
          onPress={() => setActiveTab('cycle')}
        >
          <MaterialCommunityIcons
            name="calendar-heart"
            size={20}
            color={activeTab === 'cycle' ? '#10B981' : '#9CA3AF'}
          />
          <Text style={[styles.tabText, activeTab === 'cycle' && styles.tabTextActive]}>
            Cycle
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'food' ? (
          <View style={styles.content}>
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="food-off" size={64} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No meals logged today</Text>
              <Text style={styles.emptyText}>
                Start tracking your meals to get personalized nutrition insights
              </Text>

              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowFoodModal(true)}
              >
                <MaterialCommunityIcons name="plus" size={24} color="white" />
                <Text style={styles.addButtonText}>Log Meal</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="calendar-blank" size={64} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No cycle data</Text>
              <Text style={styles.emptyText}>
                Track your menstrual cycle for cycle-aware nutrition recommendations
              </Text>

              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowCycleModal(true)}
              >
                <MaterialCommunityIcons name="plus" size={24} color="white" />
                <Text style={styles.addButtonText}>Log Period</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <FoodModal visible={showFoodModal} onClose={() => setShowFoodModal(false)} token={token} />
      <CycleModal
        visible={showCycleModal}
        onClose={() => setShowCycleModal(false)}
        token={token}
      />
    </SafeAreaView>
  );
}

function FoodModal({
  visible,
  onClose,
  token,
}: {
  visible: boolean;
  onClose: () => void;
  token: string | null;
}) {
  const [mealType, setMealType] = useState('breakfast');
  const [foodName, setFoodName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!foodName) {
      Alert.alert('Error', 'Please enter food name');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/food/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          meal_type: mealType,
          items: [
            {
              name: foodName,
              quantity: quantity || '1 serving',
              calories: 200,
              protein: 10,
              carbs: 20,
              fat: 8,
            },
          ],
        }),
      });

      if (response.ok) {
        Alert.alert('Success', 'Meal logged successfully');
        setFoodName('');
        setQuantity('');
        onClose();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to log meal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Log Meal</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Meal Type</Text>
              <View style={styles.mealTypeButtons}>
                {['breakfast', 'lunch', 'dinner', 'snacks'].map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.mealTypeButton,
                      mealType === type && styles.mealTypeButtonActive,
                    ]}
                    onPress={() => setMealType(type)}
                  >
                    <Text
                      style={[
                        styles.mealTypeButtonText,
                        mealType === type && styles.mealTypeButtonTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Food Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., 2 rotis with dal"
                value={foodName}
                onChangeText={setFoodName}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Quantity (optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., 1 bowl, 2 pieces"
                value={quantity}
                onChangeText={setQuantity}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Logging...' : 'Log Meal'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CycleModal({
  visible,
  onClose,
  token,
}: {
  visible: boolean;
  onClose: () => void;
  token: string | null;
}) {
  const [startDate, setStartDate] = useState('');
  const [flowIntensity, setFlowIntensity] = useState('medium');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const symptomOptions = ['Cramps', 'Bloating', 'Mood Changes', 'Headache', 'Fatigue'];

  const toggleSymptom = (symptom: string) => {
    setSymptoms(prev =>
      prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]
    );
  };

  const handleSubmit = async () => {
    if (!startDate) {
      Alert.alert('Error', 'Please enter start date');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/cycle/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          start_date: new Date(startDate).toISOString(),
          flow_intensity: flowIntensity,
          symptoms: symptoms,
        }),
      });

      if (response.ok) {
        Alert.alert('Success', 'Period logged successfully');
        setStartDate('');
        setSymptoms([]);
        onClose();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to log period');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Log Period</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Start Date</Text>
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD"
                value={startDate}
                onChangeText={setStartDate}
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.hint}>Format: 2025-01-15</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Flow Intensity</Text>
              <View style={styles.mealTypeButtons}>
                {['light', 'medium', 'heavy'].map(intensity => (
                  <TouchableOpacity
                    key={intensity}
                    style={[
                      styles.mealTypeButton,
                      flowIntensity === intensity && styles.mealTypeButtonActive,
                    ]}
                    onPress={() => setFlowIntensity(intensity)}
                  >
                    <Text
                      style={[
                        styles.mealTypeButtonText,
                        flowIntensity === intensity && styles.mealTypeButtonTextActive,
                      ]}
                    >
                      {intensity.charAt(0).toUpperCase() + intensity.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Symptoms</Text>
              <View style={styles.symptomContainer}>
                {symptomOptions.map(symptom => (
                  <TouchableOpacity
                    key={symptom}
                    style={[
                      styles.symptomChip,
                      symptoms.includes(symptom) && styles.symptomChipActive,
                    ]}
                    onPress={() => toggleSymptom(symptom)}
                  >
                    <Text
                      style={[
                        styles.symptomText,
                        symptoms.includes(symptom) && styles.symptomTextActive,
                      ]}
                    >
                      {symptom}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Logging...' : 'Log Period'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#10B981',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  modalBody: {
    padding: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
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
  mealTypeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mealTypeButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  mealTypeButtonActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  mealTypeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  mealTypeButtonTextActive: {
    color: '#10B981',
  },
  symptomContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  symptomChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  symptomChipActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  symptomText: {
    fontSize: 14,
    color: '#6B7280',
  },
  symptomTextActive: {
    color: '#10B981',
  },
  submitButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
