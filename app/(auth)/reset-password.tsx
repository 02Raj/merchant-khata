import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { authErrorMessage, establishPasswordRecoverySession, updateOwnerPassword, validateOwnerPassword } from '@/lib/auth';
import { Colors } from '@/lib/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [linkReady, setLinkReady] = useState(!!session);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session) {
      setLinkReady(true);
      return;
    }

    const handleUrl = async (url: string | null) => {
      if (!url) {
        setError('Open the latest password reset link from your email.');
        return;
      }
      try {
        await establishPasswordRecoverySession(url);
        setLinkReady(true);
        setError(null);
      } catch (err) {
        setError(authErrorMessage(err, 'This reset link is invalid or expired.'));
      }
    };

    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    return () => subscription.remove();
  }, [session]);

  const savePassword = async () => {
    setError(null);
    const validationError = validateOwnerPassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await updateOwnerPassword(password);
      router.replace('/');
    } catch (err) {
      setError(authErrorMessage(err, 'Could not update password. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.iconCircle}><Ionicons name="lock-closed" size={28} color={Colors.accent} /></View>
          <Text style={styles.title}>Set new password</Text>
          <Text style={styles.subtitle}>Use at least 8 characters and one number.</Text>

          {!linkReady && !error ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 28 }} /> : null}

          {linkReady ? (
            <View style={styles.form}>
              <Text style={styles.label}>New password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  placeholderTextColor={Colors.textSecondary}
                />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(value => !value)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Confirm password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  placeholder="Type password again"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>

              <TouchableOpacity style={[styles.primaryButton, saving && styles.disabled]} onPress={savePassword} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.primaryButtonText}>Save new password</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
          {!linkReady ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.secondaryButtonText}>Back to login</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  keyboard: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 56 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { color: Colors.textPrimary, fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  form: { gap: 10 },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 4 },
  inputRow: { height: 56, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10 },
  input: { flex: 1, height: '100%', paddingHorizontal: 16, color: Colors.textPrimary, fontSize: 16 },
  eyeButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { height: 56, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryButtonText: { color: Colors.bg, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  errorBox: { padding: 12, borderRadius: 8, backgroundColor: 'rgba(201, 162, 39, 0.15)', borderLeftWidth: 3, borderLeftColor: Colors.warn, marginTop: 16 },
  errorText: { color: Colors.textPrimary, fontSize: 13, lineHeight: 19 },
  secondaryButton: { alignItems: 'center', padding: 16, marginTop: 8 },
  secondaryButtonText: { color: Colors.accentInk, fontWeight: '600' },
});
