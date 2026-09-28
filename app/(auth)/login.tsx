import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import {
  authErrorMessage,
  sendOwnerPasswordReset,
  signInOwnerWithEmail,
  validateOwnerEmail,
} from '@/lib/auth';
import { Colors } from '@/lib/theme';

export default function LoginScreen() {
  return <EmailLoginScreen />;
}

function EmailLoginScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'owner' | 'staff'>('owner');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setError(null);
    const emailError = validateOwnerEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setLoading(true);
    try {
      await signInOwnerWithEmail(email, password);
    } catch (err) {
      setError(authErrorMessage(err, 'Could not log in. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    setResetEmail(email.trim());
    setResetSent(false);
    setError(null);
    setResetModalVisible(true);
  };

  const onForgot = async () => {
    setError(null);
    const emailError = validateOwnerEmail(resetEmail);
    if (emailError) {
      setError('Enter the email used for your owner account.');
      return;
    }
    setLoading(true);
    try {
      await sendOwnerPasswordReset(resetEmail, Linking.createURL('/reset-password'));
      setResetSent(true);
    } catch (err) {
      setError(authErrorMessage(err, 'Could not send reset email.'));
    } finally {
      setLoading(false);
    }
  };

  const onJoinAsStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: signUpError } = await supabase.auth.signInAnonymously();
      if (signUpError) throw signUpError;
    } catch (err: any) {
      if (err?.message?.includes('Anonymous')) {
        setError('Anonymous Auth is disabled. Enable it in Supabase Console for staff invite join.');
      } else {
        setError('Could not start staff join. Try again.');
      }
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
            <Text style={styles.title}>Login</Text>
            <Text style={styles.subtitle}>Owner: email and password. Staff: PIN on the shop phone, or invite code on your phone. No SMS.</Text>
          </View>

          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'owner' && styles.tabBtnActive]}
              onPress={() => { setTab('owner'); setError(null); }}
            >
              <Text style={[styles.tabText, tab === 'owner' && styles.tabTextActive]}>Owner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'staff' && styles.tabBtnActive]}
              onPress={() => { setTab('staff'); setError(null); }}
            >
              <Text style={[styles.tabText, tab === 'staff' && styles.tabTextActive]}>Staff</Text>
            </TouchableOpacity>
          </View>

          {tab === 'owner' ? (
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
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textSecondary}
                  editable={!loading}
                />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(value => !value)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, loading ? styles.buttonDisabled : null]}
                onPress={onLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? <ActivityIndicator color={Colors.bg} size="small" /> : <Text style={styles.buttonText}>Log in</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={openForgotPassword} disabled={loading} style={styles.linkBtn}>
                <Text style={styles.linkText}>Forgot password</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('/(auth)/signup' as any)} disabled={loading} style={styles.linkBtn}>
                <Text style={styles.linkText}>New shop? Sign up</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.staffCopy}>
                Shared till: owner logs in once, then Settings → Switch user → staff PIN.
              </Text>
              <Text style={styles.staffCopy}>
                Your own phone: join with the owner’s 6-digit invite code. No OTP.
              </Text>
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.button, loading ? styles.buttonDisabled : null]}
                onPress={onJoinAsStaff}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.bg} size="small" />
                ) : (
                  <Text style={styles.buttonText}>Join with invite code</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={resetModalVisible} animationType="slide" transparent onRequestClose={() => setResetModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{resetSent ? 'Check your email' : 'Reset password'}</Text>
                <Text style={styles.modalSubtitle}>
                  {resetSent ? 'Open the latest link we sent. Check spam if needed.' : 'We will email you a secure password reset link.'}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => { setResetModalVisible(false); setError(null); }}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {resetSent ? (
              <>
                <View style={styles.sentBox}>
                  <Ionicons name="mail-outline" size={24} color={Colors.ok} />
                  <Text style={styles.sentText}>Link sent to {resetEmail.trim()}</Text>
                </View>
                <TouchableOpacity style={styles.button} onPress={() => setResetModalVisible(false)}>
                  <Text style={styles.buttonText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>Owner email</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder="owner@shop.com"
                    placeholderTextColor={Colors.textSecondary}
                    autoFocus
                  />
                </View>
                {error ? <View style={styles.errorContainer}><Text style={styles.errorText}>{error}</Text></View> : null}
                <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={onForgot} disabled={loading}>
                  {loading ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.buttonText}>Send reset link</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  keyboardView: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
  header: { marginBottom: 24 },
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
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  tabBtnActive: { backgroundColor: Colors.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.bg },
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
  eyeButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
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
  staffCopy: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  errorContainer: {
    backgroundColor: 'rgba(201, 162, 39, 0.15)',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warn,
    marginTop: 4,
  },
  errorText: { color: Colors.textPrimary, fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  modalTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  modalSubtitle: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
  sentBox: { minHeight: 64, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  sentText: { flex: 1, color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
});
