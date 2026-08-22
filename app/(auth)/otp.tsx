import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import FirebaseRecaptchaVerifierModal from '@/components/FirebaseRecaptchaVerifierModal';
import { useAuth } from '@/context/AuthContext';
import { authErrorMessage, sendPhoneOtp, verifyPhoneOtp } from '@/lib/auth';
import { getFirebaseWebConfig } from '@/lib/firebaseConfig';
import { formatIndiaDisplay } from '@/lib/phone';
import { Colors } from '@/lib/theme';

const RESEND_SECONDS = 30;

export default function OtpScreen() {
  const router = useRouter();
  const recaptchaRef = useRef<FirebaseRecaptchaVerifierModal>(null);
  const { refreshMembership } = useAuth();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  let firebaseConfig = null;
  try {
    firebaseConfig = getFirebaseWebConfig();
  } catch {
    firebaseConfig = null;
  }

  useEffect(() => {
    if (!phone) {
      router.replace('/(auth)/login');
    }
  }, [phone, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const onVerify = async () => {
    if (!phone) return;
    setError(null);

    if (!/^\d{6}$/.test(token)) {
      setError('Enter the 6-digit OTP.');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyPhoneOtp(token);
      if (!result.session) {
        setError('Verification succeeded but no session was created. Try again.');
        return;
      }
      const hasBusiness = await refreshMembership();
      if (hasBusiness) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/(auth)/business-setup');
      }
    } catch (err) {
      setError(authErrorMessage(err, 'Wrong or expired OTP. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (!phone || cooldown > 0) return;
    const verifier = recaptchaRef.current;
    if (!verifier) {
      setError('Firebase config is missing. Update .env and restart Expo.');
      return;
    }

    setError(null);
    setResending(true);
    try {
      await sendPhoneOtp(phone, verifier);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(authErrorMessage(err, 'Could not resend OTP. Try again.'));
    } finally {
      setResending(false);
    }
  };

  if (!phone) {
    return (
      <View>
        <Text>Loading</Text>
      </View>
    );
  }

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
            <Text style={styles.title}>Verification</Text>
            <Text style={styles.subtitle}>Enter OTP sent to {formatIndiaDisplay(phone)}</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>6-Digit OTP</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={(text) => setToken(text.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={Colors.textSecondary}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
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
              style={[styles.button, loading || token.length < 6 ? styles.buttonDisabled : null]}
              onPress={onVerify}
              disabled={loading || token.length < 6}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>Didn't receive the code? </Text>
              <TouchableOpacity 
                onPress={onResend} 
                disabled={cooldown > 0 || resending || loading}
              >
                <Text style={[styles.resendLink, (cooldown > 0 || resending || loading) && styles.resendLinkDisabled]}>
                  {cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : resending
                      ? 'Resending…'
                      : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </View>
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
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  resendText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  resendLink: {
    color: Colors.accentInk,
    fontSize: 14,
    fontWeight: '500',
  },
  resendLinkDisabled: {
    color: Colors.textSecondary,
    opacity: 0.5,
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
