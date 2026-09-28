import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/context/AuthContext';
import { authErrorMessage } from '@/lib/auth';
import { verifyStaffPin } from '@/lib/staffAuth';
import { nextPinLockState, recordPinFailure, type PinLockState } from '@/lib/staffPin';
import { Colors } from '@/lib/theme';

export default function StaffPinScreen() {
  const router = useRouter();
  const { businessInfo, membership, setActiveStaff } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const businessId = membership?.id ?? businessInfo?.id;

  const onSubmit = async () => {
    if (!businessId) {
      setError('No shop on this device. Owner must log in first.');
      return;
    }
    setError(null);
    const lockKey = `omnibill:pinLock:${businessId}`;
    let lock: PinLockState | null = null;
    try {
      const raw = await AsyncStorage.getItem(lockKey);
      lock = raw ? (JSON.parse(raw) as PinLockState) : null;
    } catch {
      lock = null;
    }
    const gate = nextPinLockState(lock);
    if (!gate.allowed) {
      setError(gate.message ?? 'Too many attempts.');
      return;
    }

    setLoading(true);
    try {
      const staff = await verifyStaffPin(businessId, pin);
      await AsyncStorage.setItem(lockKey, JSON.stringify({ attempts: 0, lockedUntil: 0 }));
      await setActiveStaff(staff);
      router.replace('/');
    } catch (err) {
      const next = recordPinFailure(gate.state);
      await AsyncStorage.setItem(lockKey, JSON.stringify(next));
      setError(authErrorMessage(err, 'Invalid PIN'));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.kicker}>OmniBill · Staff</Text>
          <Text style={styles.title}>Enter PIN</Text>
          <Text style={styles.subtitle}>Clock in on this shop device. Owner stays logged in.</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="4–6 digits"
              placeholderTextColor={Colors.textSecondary}
              editable={!loading}
              autoFocus
            />
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading || pin.length < 4 ? styles.buttonDisabled : null]}
            onPress={onSubmit}
            disabled={loading || pin.length < 4}
          >
            {loading ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.buttonText}>Clock in</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.linkBtn}>
            <Text style={styles.linkText}>Back</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  keyboardView: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
  kicker: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.accentInk,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  title: { fontSize: 28, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  inputContainer: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    height: 56,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    height: '100%',
    fontWeight: '500',
  },
  button: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { backgroundColor: Colors.accentDim, opacity: 0.8 },
  buttonText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  linkBtn: { alignItems: 'center', paddingVertical: 16 },
  linkText: { color: Colors.accentInk, fontSize: 14 },
  errorContainer: {
    backgroundColor: 'rgba(201, 162, 39, 0.15)',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warn,
    marginTop: 12,
  },
  errorText: { color: Colors.textPrimary, fontSize: 13 },
});
