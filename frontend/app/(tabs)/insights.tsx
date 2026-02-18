import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function InsightsScreen() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [featureData, setFeatureData] = useState<any>(null);

  const loadFeature = async (feature: string, endpoint: string) => {
    setLoading(true);
    setActiveFeature(feature);
    try {
      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFeatureData(data);
      } else {
        setFeatureData({ error: 'Failed to load data' });
      }
    } catch (error) {
      console.error(`${feature} error:`, error);
      setFeatureData({ error: 'Something went wrong' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    if (activeFeature) {
      setRefreshing(true);
      const featureMap: any = {
        patterns: '/api/patterns/analyze',
        anemia: '/api/health/anemia-risk',
        weight: '/api/patterns/weight-analysis',
      };
      if (featureMap[activeFeature]) {
        loadFeature(activeFeature, featureMap[activeFeature]);
      }
    }
  };

  const goBack = () => {
    setActiveFeature(null);
    setFeatureData(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {activeFeature ? (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={goBack} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#10B981" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {activeFeature === 'patterns' && 'Health Patterns'}
              {activeFeature === 'anemia' && 'Anemia Risk'}
              {activeFeature === 'weight' && 'Weight Analysis'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>AI Health Insights</Text>
            <Text style={styles.headerSubtitle}>
              Advanced AI-powered health analysis
            </Text>
          </>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {!activeFeature ? (
          <View style={styles.featuresGrid}>
            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => loadFeature('patterns', '/api/patterns/analyze')}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#EFF6FF' }]}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={32} color="#3B82F6" />
              </View>
              <Text style={styles.featureTitle}>Pattern Detection</Text>
              <Text style={styles.featureDescription}>
                Discover correlations between food, cycle, and symptoms
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => loadFeature('anemia', '/api/health/anemia-risk')}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#FEE2E2' }]}>
                <MaterialCommunityIcons name="heart-pulse" size={32} color="#EF4444" />
              </View>
              <Text style={styles.featureTitle}>Anemia Risk</Text>
              <Text style={styles.featureDescription}>
                Check your iron intake and fatigue patterns
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => loadFeature('weight', '/api/patterns/weight-analysis')}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#F0FDF4' }]}>
                <MaterialCommunityIcons name="scale-bathroom" size={32} color="#10B981" />
              </View>
              <Text style={styles.featureTitle}>Weight Analysis</Text>
              <Text style={styles.featureDescription}>
                Understand causes of weight fluctuations
              </Text>
            </TouchableOpacity>

            <View style={styles.comingSoonCard}>
              <View style={[styles.iconContainer, { backgroundColor: '#FEF3C7' }]}>
                <MaterialCommunityIcons name="school" size={32} color="#F59E0B" />
              </View>
              <Text style={styles.featureTitle}>Exam Mode</Text>
              <Text style={styles.featureDescription}>
                Brain-boosting recommendations (Coming Soon)
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.resultContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.loadingText}>Analyzing with AI...</Text>
              </View>
            ) : featureData?.error ? (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={48} color="#EF4444" />
                <Text style={styles.errorText}>{featureData.error}</Text>
              </View>
            ) : (
              <>
                {activeFeature === 'patterns' && <PatternResults data={featureData} />}
                {activeFeature === 'anemia' && <AnemiaResults data={featureData} />}
                {activeFeature === 'weight' && <WeightResults data={featureData} />}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PatternResults({ data }: { data: any }) {
  if (!data) return null;

  return (
    <View style={styles.resultsContent}>
      {data.detected_patterns && data.detected_patterns.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detected Patterns</Text>
          {data.detected_patterns.map((pattern: string, index: number) => (
            <View key={index} style={styles.patternCard}>
              <MaterialCommunityIcons name="chart-line" size={20} color="#3B82F6" />
              <Text style={styles.patternText}>{pattern}</Text>
            </View>
          ))}
        </View>
      )}

      {data.food_symptom_correlations && data.food_symptom_correlations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Food-Symptom Correlations</Text>
          {data.food_symptom_correlations.map((correlation: string, index: number) => (
            <View key={index} style={styles.correlationCard}>
              <Text style={styles.correlationText}>{correlation}</Text>
            </View>
          ))}
        </View>
      )}

      {data.recommendations && data.recommendations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommendations</Text>
          {data.recommendations.map((rec: string, index: number) => (
            <View key={index} style={styles.recommendationCard}>
              <MaterialCommunityIcons name="lightbulb-on" size={16} color="#10B981" />
              <Text style={styles.recommendationText}>{rec}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function AnemiaResults({ data }: { data: any }) {
  if (!data) return null;

  const getRiskColor = (level: string) => {
    if (level === 'low') return '#10B981';
    if (level === 'moderate') return '#F59E0B';
    return '#EF4444';
  };

  return (
    <View style={styles.resultsContent}>
      <View style={[styles.riskCard, { borderLeftColor: getRiskColor(data.risk_level) }]}>
        <View style={styles.riskHeader}>
          <Text style={styles.riskScore}>{data.risk_score}%</Text>
          <Text style={[styles.riskLevel, { color: getRiskColor(data.risk_level) }]}>
            {data.risk_level?.toUpperCase()} RISK
          </Text>
        </View>
      </View>

      {data.risk_factors && data.risk_factors.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risk Factors</Text>
          {data.risk_factors.map((factor: string, index: number) => (
            <View key={index} style={styles.factorCard}>
              <MaterialCommunityIcons name="alert" size={16} color="#F59E0B" />
              <Text style={styles.factorText}>{factor}</Text>
            </View>
          ))}
        </View>
      )}

      {data.iron_rich_foods && data.iron_rich_foods.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Iron-Rich Foods</Text>
          <View style={styles.foodsGrid}>
            {data.iron_rich_foods.map((food: string, index: number) => (
              <View key={index} style={styles.foodChip}>
                <Text style={styles.foodText}>{food}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {data.recommendations && data.recommendations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommendations</Text>
          {data.recommendations.map((rec: string, index: number) => (
            <View key={index} style={styles.recommendationCard}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
              <Text style={styles.recommendationText}>{rec}</Text>
            </View>
          ))}
        </View>
      )}

      {data.should_consult_doctor && (
        <View style={styles.warningCard}>
          <MaterialCommunityIcons name="doctor" size={24} color="#EF4444" />
          <Text style={styles.warningText}>
            Consider consulting a doctor for proper diagnosis
          </Text>
        </View>
      )}
    </View>
  );
}

function WeightResults({ data }: { data: any }) {
  if (!data) return null;

  return (
    <View style={styles.resultsContent}>
      <View style={styles.explainCard}>
        <MaterialCommunityIcons name="information" size={24} color="#3B82F6" />
        <Text style={styles.explainText}>{data.explanation}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Primary Cause</Text>
        <View style={styles.primaryCard}>
          <Text style={styles.primaryText}>{data.primary_cause}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contributing Factors</Text>
        <View style={styles.factorsList}>
          {data.is_water_retention && (
            <View style={styles.factorBadge}>
              <MaterialCommunityIcons name="water" size={16} color="#3B82F6" />
              <Text style={styles.badgeText}>Water Retention</Text>
            </View>
          )}
          {data.is_hormonal && (
            <View style={styles.factorBadge}>
              <MaterialCommunityIcons name="heart-pulse" size={16} color="#EC4899" />
              <Text style={styles.badgeText}>Hormonal</Text>
            </View>
          )}
          {data.is_dietary && (
            <View style={styles.factorBadge}>
              <MaterialCommunityIcons name="food" size={16} color="#F59E0B" />
              <Text style={styles.badgeText}>Dietary</Text>
            </View>
          )}
        </View>
      </View>

      {data.action_items && data.action_items.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action Items</Text>
          {data.action_items.map((item: string, index: number) => (
            <View key={index} style={styles.actionCard}>
              <MaterialCommunityIcons name="check" size={16} color="#10B981" />
              <Text style={styles.actionText}>{item}</Text>
            </View>
          ))}
        </View>
      )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 8,
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
    paddingBottom: 32,
  },
  featuresGrid: {
    gap: 16,
  },
  featureCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  comingSoonCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    opacity: 0.6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  resultContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  resultsContent: {
    gap: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  patternCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  patternText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  correlationCard: {
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  correlationText: {
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
  },
  recommendationCard: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
  },
  riskCard: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  riskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riskScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#111827',
  },
  riskLevel: {
    fontSize: 16,
    fontWeight: '600',
  },
  factorCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    gap: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  factorText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
  },
  foodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  foodChip: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  foodText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FEE2E2',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    alignItems: 'center',
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#B91C1C',
    fontWeight: '500',
  },
  explainCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  explainText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  primaryCard: {
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 12,
  },
  primaryText: {
    fontSize: 16,
    color: '#166534',
    fontWeight: '500',
  },
  factorsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  factorBadge: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  badgeText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  actionCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    gap: 12,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  actionText: {
    flex: 1,
    fontSize: 14,
    color: '#166534',
  },
});
