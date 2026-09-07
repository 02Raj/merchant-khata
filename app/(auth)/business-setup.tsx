import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, ScrollView, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { getFirebaseAuth } from '@/lib/firebase';

type BusinessType = 'retail' | 'wholesale' | 'both' | 'restaurant';

const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", 
  "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli", "Daman and Diu", 
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", 
  "Kerala", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", 
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", 
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

export default function BusinessSetupScreen() {
  const { refreshMembership } = useAuth();
  
  const [mode, setMode] = useState<'create' | 'join'>('create');
  
  // Create State
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [gstin, setGstin] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('retail');
  
  // Modals
  const [stateModalVisible, setStateModalVisible] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  
  // Join State
  const [joinCode, setJoinCode] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredStates = INDIAN_STATES.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase()));

  const onSubmit = async () => {
    setError(null);

    if (mode === 'join') {
      if (joinCode.length !== 6) {
        setError('Please enter a valid 6-digit code.');
        return;
      }
      setLoading(true);
      try {
        const { error: joinError } = await supabase.rpc('join_business_as_staff', { p_code: joinCode });
        if (joinError) throw joinError;

        const hasBusiness = await refreshMembership();
        if (!hasBusiness) throw new Error('Joined successfully, but failed to load dashboard.');
      } catch (err: any) {
        setError(err.message || 'Invalid Invite Code.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!name.trim() || !street.trim() || !city.trim() || !stateName || pincode.trim().length !== 6) {
      setError('Please fill all the required address fields correctly.');
      return;
    }

    setLoading(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not authenticated');

      const ownerPhone = user.phoneNumber || '';
      const fullAddress = `${street.trim()}, ${city.trim()}, ${stateName} - ${pincode.trim()}`;

      const { error: insertError } = await supabase.from('businesses').insert({
        name: name.trim(),
        owner_phone: ownerPhone,
        address: fullAddress,
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

  const isFormValid = mode === 'join' 
    ? joinCode.length === 6 
    : (name.trim().length > 0 && street.trim().length > 0 && city.trim().length > 0 && stateName.length > 0 && pincode.trim().length === 6);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.kicker}>OmniBill · Setup</Text>
            <Text style={styles.title}>{mode === 'create' ? 'Register Business' : 'Join as Staff'}</Text>
            <Text style={styles.subtitle}>
              {mode === 'create' 
                ? 'Enter details to get started with billing.' 
                : 'Enter the 6-digit invite code from the owner.'}
            </Text>
          </View>
          
          <View style={styles.tabsContainer}>
            <TouchableOpacity 
              style={[styles.tabBtn, mode === 'create' && styles.tabBtnActive]}
              onPress={() => { setMode('create'); setError(null); }}
            >
              <Text style={[styles.tabText, mode === 'create' && styles.tabTextActive]}>Create New</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabBtn, mode === 'join' && styles.tabBtnActive]}
              onPress={() => { setMode('join'); setError(null); }}
            >
              <Text style={[styles.tabText, mode === 'join' && styles.tabTextActive]}>Join as Staff</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {mode === 'join' ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Invite Code *</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, { fontSize: 24, letterSpacing: 4, textAlign: 'center' }]}
                    value={joinCode}
                    onChangeText={(t) => setJoinCode(t.replace(/\D/g, '').slice(0,6))}
                    placeholder="000000"
                    keyboardType="number-pad"
                    placeholderTextColor={Colors.textSecondary}
                    editable={!loading}
                  />
                </View>
              </View>
            ) : (
              <>
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
              <Text style={styles.label}>Shop No & Area *</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={street}
                  onChangeText={setStreet}
                  placeholder="e.g. Shop 12, Main Market"
                  placeholderTextColor={Colors.textSecondary}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>City *</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={city}
                    onChangeText={setCity}
                    placeholder="City Name"
                    placeholderTextColor={Colors.textSecondary}
                    editable={!loading}
                  />
                </View>
              </View>
              
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>PIN Code *</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={pincode}
                    onChangeText={(t) => setPincode(t.replace(/\D/g, '').slice(0,6))}
                    placeholder="000000"
                    keyboardType="number-pad"
                    placeholderTextColor={Colors.textSecondary}
                    editable={!loading}
                  />
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>State *</Text>
              <TouchableOpacity 
                style={styles.inputContainer} 
                onPress={() => !loading && setStateModalVisible(true)}
              >
                <Text style={[styles.input, { lineHeight: 56, color: stateName ? Colors.textPrimary : Colors.textSecondary }]}>
                  {stateName || "Select State"}
                </Text>
                <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} style={{ marginRight: 16 }} />
              </TouchableOpacity>
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
                {(['retail', 'wholesale', 'both', 'restaurant'] as BusinessType[]).map((type) => (
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
              </>
            )}
            
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
                <Text style={styles.buttonText}>{mode === 'create' ? 'Complete Setup' : 'Join Business'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* State Picker Modal */}
      <Modal visible={stateModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select State</Text>
            <TouchableOpacity onPress={() => setStateModalVisible(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchSection}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
              <TextInput 
                style={styles.searchInput} 
                placeholder="Search state..." 
                placeholderTextColor={Colors.textSecondary}
                value={stateSearch}
                onChangeText={setStateSearch}
              />
              {stateSearch.length > 0 && (
                <TouchableOpacity onPress={() => setStateSearch('')}>
                  <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <FlatList
            data={filteredStates}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.stateRow}
                onPress={() => {
                  setStateName(item);
                  setStateModalVisible(false);
                  setStateSearch('');
                }}
              >
                <Text style={[styles.stateRowText, stateName === item && styles.stateRowTextActive]}>{item}</Text>
                {stateName === item && <Ionicons name="checkmark" size={20} color={Colors.ok} />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
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
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: Colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.bg,
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
  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  modalClose: { padding: 4 },
  searchSection: { padding: 16, paddingBottom: 0 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 12, height: 50, borderWidth: 1, borderColor: Colors.border },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: Colors.textPrimary },
  stateRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stateRowText: { fontSize: 16, color: Colors.textPrimary },
  stateRowTextActive: { color: Colors.ok, fontWeight: '600' }
});
