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

import { useAuth } from '@/context/AuthContext';
import { authErrorMessage, signInOwnerWithEmail } from '@/lib/auth';
import {
  PLATFORM_OWNER_DEFAULT_PASSWORD,
  PLATFORM_OWNER_EMAIL,
  syncPlatformAdminUid,
} from '@/lib/platformAdmin';
import { Colors } from '@/lib/theme';

export default function OwnerLoginScreen() {
  const router = useRouter();
  const { refreshPlatformAdmin } = useAuth();
  const [email, setEmail] = useState(PLATFORM_OWNER_EMAIL);
  const [password, setPassword] = useState(PLATFORM_OWNER_DEFAULT_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setError(null);

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      await signInOwnerWithEmail(email, password);
      await syncPlatformAdminUid();
      const isAdmin = await refreshPlatformAdmin();
      if (!isAdmin) {
        throw new Error('This account is not authorized as an application owner.');
      }
      router.replace('/(admin)' as never);
    } catch (err) {
      setError(authErrorMessage(err, 'Login failed. Check email, password, and Firebase setup.'));
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backText}>← Merchant login</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.kicker}>OmniBill · Platform</Text>
            <Text style={styles.title}>Application Owner</Text>
            <Text style={styles.subtitle}>
              View all tenants, users, and platform usage across OmniBill.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Owner email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="owner@email.com"
              placeholderTextColor={Colors.textSecondary}
              editable={!loading}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Super admin password"
              placeholderTextColor={Colors.textSecondary}
              editable={!loading}
            />

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
              {loading ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <Text style={styles.buttonText}>Sign in as Owner</Text>
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
    paddingTop: 16,
  },
  backLink: {
    marginBottom: 24,
  },
  backText: {
    color: Colors.accentInk,
    fontSize: 14,
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
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    color: Colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 16,
    height: 52,
  },
  button: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: Colors.accentDim,
    opacity: 0.8,
  },
  buttonText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(201, 162, 39, 0.15)',
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warn,
    marginTop: 8,
  },
  errorText: {
    color: Colors.textPrimary,
    fontSize: 13,
  },
});
