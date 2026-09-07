import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInAnonymously } from 'firebase/auth';

import FirebaseRecaptchaVerifierModal from '@/components/FirebaseRecaptchaVerifierModal';
import { authErrorMessage, sendPhoneOtp } from '@/lib/auth';
import { getFirebaseWebConfig } from '@/lib/firebaseConfig';
import { toE164India } from '@/lib/phone';
import { Colors } from '@/lib/theme';
import { getFirebaseAuth } from '@/lib/firebase';

export default function LoginScreen() {
  const router = useRouter();
  const recaptchaRef = useRef<FirebaseRecaptchaVerifierModal>(null);
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const firebaseConfig = useMemo(() => {
    try {
      return getFirebaseWebConfig();
    } catch {
      return null;
    }
  }, []);

  const onSendOtp = async () => {
    setError(null);
    const parsed = toE164India(digits);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    const verifier = recaptchaRef.current;
    if (!verifier) {
      setError(firebaseConfig ? 'reCAPTCHA not ready. Tap Send OTP again.' : 'Firebase config not loaded. Restart Expo.');
      return;
    }

    setLoading(true);
    try {
      await sendPhoneOtp(parsed.phone, verifier);
      router.push({ pathname: '/(auth)/otp', params: { phone: parsed.phone } });
    } catch (err) {
      setError(authErrorMessage(err, 'Could not send OTP. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const onJoinAsStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      await signInAnonymously(auth);
      // RootNavigator will automatically redirect to business-setup since hasBusiness will be false
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Anonymous Auth is disabled. Please enable it in Firebase Console.');
      } else {
        setError('Failed to login as staff. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {firebaseConfig ? (
            <FirebaseRecaptchaVerifierModal ref={recaptchaRef} firebaseConfig={firebaseConfig} />
          ) : null}

          <View style={styles.header}>
            <Text style={styles.kicker}>OmniBill · Auth</Text>
            <Text style={styles.title}>Login or Signup</Text>
            <Text style={styles.subtitle}>Owner: Use mobile number for OTP.</Text>
            <Text style={styles.subtitle}>Staff: Use the Join as Staff button below.</Text>
          </View>
          
          <View style={styles.form}>
            <Text style={styles.label}>Phone number (Owner Only)</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                style={styles.input}
                value={digits}
                onChangeText={(text) => setDigits(text.replace(/\D/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
                placeholder="10-digit mobile"
                placeholderTextColor={Colors.textSecondary}
                editable={!loading}
              />
            </View>
            
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            
            <TouchableOpacity 
              style={[styles.button, loading || digits.length < 10 ? styles.buttonDisabled : null]}
              onPress={onSendOtp}
              disabled={loading || digits.length < 10}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <Text style={styles.buttonText}>Send OTP</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity 
              style={[styles.button, styles.buttonSecondary, loading ? styles.buttonDisabled : null]}
              onPress={onJoinAsStaff}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textPrimary} size="small" />
              ) : (
                <Text style={styles.buttonTextSecondary}>Join as Staff (No OTP)</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
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
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  header: {
    marginBottom: 40,
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
    gap: 12,
  },
  label: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
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
  prefix: {
    paddingHorizontal: 16,
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    height: '100%',
    textAlignVertical: 'center',
    lineHeight: 54, // Centering text vertically
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 16,
    height: '100%',
    fontWeight: '500',
  },
  button: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
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
  buttonSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 0,
  },
  buttonTextSecondary: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(201, 162, 39, 0.15)',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warn,
    marginTop: 4,
  },
  errorText: {
    color: Colors.textPrimary,
    fontSize: 13,
  },
});
