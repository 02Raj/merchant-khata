import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { getFirebaseAuth } from '@/lib/firebase';

type BusinessType = 'retail' | 'wholesale' | 'both';

export default function BusinessSetupScreen() {
  const { refreshMembership } = useAuth();
  
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('retail');
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!name.trim() || !address.trim()) {
      setError('Name and address are required.');
      return;
    }

    setLoading(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not authenticated');

      const ownerPhone = user.phoneNumber || '';

      const { error: insertError } = await supabase.from('businesses').insert({
        name: name.trim(),
        owner_phone: ownerPhone,
        address: address.trim(),
        business_type: businessType,
        gstin: gstin.trim() || null,
      });

      if (insertError) {
        throw insertError;
      }

      // Refresh membership to navigate to dashboard
      const hasBusiness = await refreshMembership();
      if (!hasBusiness) {
        throw new Error('Failed to verify business membership. Try restarting the app.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating your business.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = name.trim().length > 0 && address.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.kicker}>Merchant Desk · Setup</Text>
            <Text style={styles.title}>Register your Business</Text>
            <Text style={styles.subtitle}>Enter details to get started with billing and inventory.</Text>
          </View>
          
          <View style={styles.form}>
            {/* Business Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Name *</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Sharma General Store"
                  placeholderTextColor={Colors.textSecondary}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Address */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Address *</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Shop No, Area, City"
                  placeholderTextColor={Colors.textSecondary}
                  editable={!loading}
                />
              </View>
            </View>

            {/* GSTIN */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>GSTIN (Optional)</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={gstin}
                  onChangeText={setGstin}
                  placeholder="22AAAAA0000A1Z5"
                  placeholderTextColor={Colors.textSecondary}
                  autoCapitalize="characters"
                  editable={!loading}
                />
              </View>
            </View>

            {/* Business Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Type *</Text>
              <View style={styles.typeSelector}>
                {(['retail', 'wholesale', 'both'] as BusinessType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      businessType === type && styles.typeButtonActive,
                    ]}
                    onPress={() => setBusinessType(type)}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        businessType === type && styles.typeButtonTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            
            <TouchableOpacity 
              style={[styles.button, (loading || !isFormValid) ? styles.buttonDisabled : null]}
              onPress={onSubmit}
              disabled={loading || !isFormValid}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <Text style={styles.buttonText}>Complete Setup</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 32,
  },
  kicker: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.accentInk,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    height: 56,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 16,
    height: '100%',
    fontWeight: '500',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
  },
  typeButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  typeButtonText: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  button: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    backgroundColor: Colors.accentDim,
    opacity: 0.8,
  },
  buttonText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  errorContainer: {
    backgroundColor: 'rgba(201, 162, 39, 0.15)',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warn,
  },
  errorText: {
    color: Colors.textPrimary,
    fontSize: 13,
  },
});

