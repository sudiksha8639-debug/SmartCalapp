import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ScannerScreen() {
  const { token } = useAuth();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera roll permission is required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setSelectedImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setAnalysis(null);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setSelectedImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setAnalysis(null);
    }
  };

  const analyzeMenu = async () => {
    if (!selectedImage) return;

    setAnalyzing(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/menu/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          image_base64: selectedImage,
          date: new Date().toISOString().split('T')[0],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
      } else {
        Alert.alert('Error', 'Failed to analyze menu');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setAnalyzing(false);
    }
  };

  const startOver = () => {
    setSelectedImage(null);
    setAnalysis(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mess Menu Scanner</Text>
        <Text style={styles.headerSubtitle}>Scan and get AI-powered nutrition insights</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!selectedImage ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="camera-outline" size={80} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No menu selected</Text>
            <Text style={styles.emptyText}>
              Take a photo or choose from gallery to analyze your mess menu
            </Text>

            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.primaryButton} onPress={takePhoto}>
                <MaterialCommunityIcons name="camera" size={24} color="white" />
                <Text style={styles.primaryButtonText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={pickImage}>
                <MaterialCommunityIcons name="image" size={24} color="#10B981" />
                <Text style={styles.secondaryButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.imageContainer}>
            <Image source={{ uri: selectedImage }} style={styles.image} resizeMode="contain" />

            {!analysis && (
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.secondaryButton} onPress={startOver}>
                  <Text style={styles.secondaryButtonText}>Choose Different</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, analyzing && styles.buttonDisabled]}
                  onPress={analyzeMenu}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="brain" size={24} color="white" />
                      <Text style={styles.primaryButtonText}>Analyze Menu</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {analysis && (
              <View style={styles.analysisContainer}>
                <View style={styles.analysisHeader}>
                  <MaterialCommunityIcons name="check-circle" size={24} color="#10B981" />
                  <Text style={styles.analysisTitle}>Analysis Complete!</Text>
                </View>

                {/* Recommendations */}
                {analysis.recommendations && analysis.recommendations.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Personalized Recommendations</Text>
                    {analysis.recommendations.map((rec: string, index: number) => (
                      <View key={index} style={styles.recommendationCard}>
                        <MaterialCommunityIcons
                          name="lightbulb-on"
                          size={16}
                          color="#10B981"
                        />
                        <Text style={styles.recommendationText}>{rec}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Food Items */}
                {analysis.parsed_items && analysis.parsed_items.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Menu Items</Text>
                    {analysis.parsed_items.map((item: any, index: number) => (
                      <View key={index} style={styles.itemCard}>
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemCalories}>{item.calories} cal</Text>
                        </View>
                        <View style={styles.macros}>
                          <MacroTag
                            label="Protein"
                            value={`${item.protein}g`}
                            color="#F59E0B"
                          />
                          <MacroTag label="Carbs" value={`${item.carbs}g`} color="#3B82F6" />
                          <MacroTag label="Fat" value={`${item.fat}g`} color="#EF4444" />
                        </View>
                        {item.tags && item.tags.length > 0 && (
                          <View style={styles.tags}>
                            {item.tags.map((tag: string, idx: number) => (
                              <View key={idx} style={styles.tag}>
                                <Text style={styles.tagText}>{tag}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Overall Balance */}
                {analysis.ai_analysis?.overall_balance && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Overall Balance</Text>
                    <Text style={styles.balanceText}>
                      {analysis.ai_analysis.overall_balance}
                    </Text>
                  </View>
                )}

                <TouchableOpacity style={styles.doneButton} onPress={startOver}>
                  <Text style={styles.doneButtonText}>Scan Another Menu</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MacroTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.macroTag, { backgroundColor: color + '20' }]}>
      <Text style={[styles.macroLabel, { color }]}>{label}</Text>
      <Text style={[styles.macroValue, { color }]}>{value}</Text>
    </View>
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
  scrollContent: {
    flexGrow: 1,
    padding: 16,
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
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginTop: 32,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  secondaryButtonText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  imageContainer: {
    gap: 16,
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  analysisContainer: {
    gap: 16,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#166534',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  recommendationCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
  },
  itemCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  itemCalories: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  macros: {
    flexDirection: 'row',
    gap: 8,
  },
  macroTag: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  macroValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  balanceText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  doneButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  doneButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
