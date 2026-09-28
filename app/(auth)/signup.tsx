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

import {
  authErrorMessage,
  signUpOwnerWithEmail,
  validateOwnerEmail,
  validateOwnerPassword,
} from '@/lib/auth';
import { Colors } from '@/lib/theme';

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSignup = async () => {
    setError(null);
    const emailError = validateOwnerEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    const passwordError = validateOwnerPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const result = await signUpOwnerWithEmail(email, password);
      if (result.session) {
        // Automatically logged in
        router.replace('/(auth)/business-setup');
      } else {
        // Confirmation email sent
        import('react-native').then(({ Alert }) => {
          Alert.alert('Account Created', 'Please check your email for a confirmation link.');
        });
        router.replace('/(auth)/login');
      }
    } catch (err) {
      setError(authErrorMessage(err, 'Could not create account.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.kicker}>OmniBill · Auth</Text>
            <Text style={styles.title}>Create owner account</Text>
            <Text style={styles.subtitle}>Email and password. You will add the shop phone as a contact next — not for SMS login.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="owner@shop.com"
                placeholderTextColor={Colors.textSecondary}
                editable={!loading}
              />
            </View>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Min 8 chars, 1 number"
                placeholderTextColor={Colors.textSecondary}
                editable={!loading}
              />
            </View>
            <Text style={styles.label}>Confirm password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                placeholder="Repeat password"
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
              style={[styles.button, loading ? styles.buttonDisabled : null]}
              onPress={onSignup}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? <ActivityIndicator color={Colors.bg} size="small" /> : <Text style={styles.buttonText}>Sign up</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} disabled={loading} style={styles.linkBtn}>
              <Text style={styles.linkText}>Already have an account? Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  keyboardView: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
  header: { marginBottom: 32 },
  kicker: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.accentInk,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  title: { fontSize: 28, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  form: { gap: 12 },
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
  input: { flex: 1, color: Colors.textPrimary, fontSize: 16, paddingHorizontal: 16, height: '100%', fontWeight: '500' },
  button: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { backgroundColor: Colors.accentDim, opacity: 0.8 },
  buttonText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600', letterSpacing: 0.5 },
  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { color: Colors.accentInk, fontSize: 14, fontWeight: '500' },
  errorContainer: {
    backgroundColor: 'rgba(201, 162, 39, 0.15)',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warn,
    marginTop: 4,
  },
  errorText: { color: Colors.textPrimary, fontSize: 13 },
});
