import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Haptics from 'expo-haptics';

import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { HIDE_RESTAURANT_LAUNCH_EXTRAS, isRestaurantBusiness } from '@/lib/restaurantHelpers';
import {
  createStaffProfile,
  listStaffProfiles,
  setStaffActive,
  type StaffRow,
} from '@/lib/staffAuth';
import { authErrorMessage, updateOwnerPassword, validateOwnerPassword } from '@/lib/auth';

export default function SettingsScreen() {
  const router = useRouter();
  const { businessInfo, membership, activeStaff, setActiveStaff, signOut } = useAuth();
  const isOwnerAccount = membership?.role === 'owner';
  
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('80mm');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [staffModal, setStaffModal] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<'staff' | 'waiter'>('staff');
  const [staffPin, setStaffPin] = useState('');
  const [savingStaff, setSavingStaff] = useState(false);
  const [showStaffExtra, setShowStaffExtra] = useState(false);

  useEffect(() => {
    loadSettings();
    if (businessInfo?.id && isOwnerAccount) {
      fetchInviteCode();
      loadStaff();
    }
  }, [businessInfo?.id, isOwnerAccount]);

  const loadStaff = async () => {
    if (!businessInfo?.id) return;
    try {
      setStaffRows(await listStaffProfiles(businessInfo.id));
    } catch (e) {
      console.log('Failed to load staff', e);
    }
  };

  const fetchInviteCode = async () => {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('invite_code')
        .eq('id', businessInfo!.id)
        .single();
      if (!error && data?.invite_code) {
        setInviteCode(data.invite_code);
      }
    } catch (err) {
      console.log('Failed to fetch invite code', err);
    }
  };

  const generateInviteCode = async () => {
    setGeneratingCode(true);
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
    try {
      const { error } = await supabase
        .from('businesses')
        .update({ invite_code: code })
        .eq('id', businessInfo!.id);
      
      if (!error) {
        setInviteCode(code);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Error', 'Could not generate code. Try again.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingCode(false);
    }
  };

  const loadSettings = async () => {
    try {
      const savedSize = await AsyncStorage.getItem('printerPaperSize');
      if (savedSize === '58mm' || savedSize === '80mm') {
        setPaperSize(savedSize);
      }
    } catch (e) {
      console.error('Failed to load printer settings', e);
    }
  };

  const saveSettings = async (size: '58mm' | '80mm') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPaperSize(size);
    try {
      await AsyncStorage.setItem('printerPaperSize', size);
    } catch (e) {
      console.error('Failed to save printer settings', e);
    }
  };

  const handleTestPrint = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const pxWidth = paperSize === '58mm' ? 210 : 300;
    
    const html = `
      <html lang="en">
      <head>
        <style>
          @page { margin: 0; size: ${paperSize} auto; }
          body { 
            font-family: monospace; 
            margin: 0; 
            padding: 10px; 
            width: ${pxWidth}px;
            color: #000;
            font-size: 14px;
            line-height: 1.2;
          }
          .center { text-align: center; }
          .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="center title">${(businessInfo as any)?.name || 'OMNIBILL'}</div>
        <div class="center">TEST PRINT SUCCESSFUL</div>
        <div class="divider"></div>
        <div>
          Paper Size: ${paperSize}<br>
          Date: ${new Date().toLocaleString('en-IN')}<br>
        </div>
        <div class="divider"></div>
        <div class="center">Your printer is configured perfectly and ready for billing!</div>
      </body>
      </html>
    `;

    try {
      await Print.printAsync({ html });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to print test receipt');
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to log out of your account?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Sign Out", 
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  const closePasswordModal = () => {
    setPasswordModal(false);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setPasswordError(null);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    const validationError = validateOwnerPassword(newPassword);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await updateOwnerPassword(newPassword);
      closePasswordModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Password changed', 'Use your new password the next time you log in.');
    } catch (error) {
      setPasswordError(authErrorMessage(error, 'Could not change password. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.profileInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(businessInfo as any)?.name.charAt(0) || 'U'}</Text>
              </View>
              <View>
                <Text style={styles.storeName}>{(businessInfo as any)?.name}</Text>
                <Text style={styles.storeType}>{businessInfo?.business_type.toUpperCase()} STORE</Text>
                {activeStaff ? (
                  <Text style={styles.storeType}>Clocked in: {activeStaff.displayName} ({activeStaff.role})</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push('/(auth)/staff-pin' as any)}
            >
              <Ionicons name="keypad-outline" size={20} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Switch user (staff PIN)</Text>
            </TouchableOpacity>
            {activeStaff ? (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={async () => {
                    await setActiveStaff(null);
                    router.replace('/');
                  }}
                >
                  <Ionicons name="person-outline" size={20} color={Colors.accent} />
                  <Text style={styles.actionBtnText}>Back to owner</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {isOwnerAccount && !activeStaff ? (
              <>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.actionBtn} onPress={() => setPasswordModal(true)}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.accent} />
                  <Text style={styles.actionBtnText}>Change password</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>

        {/* Staff / waiter invite — restaurant launch hides this; login + generateInviteCode stay for later. */}
        {isOwnerAccount && (
          <View style={styles.section}>
            {isRestaurantBusiness(businessInfo?.business_type) && HIDE_RESTAURANT_LAUNCH_EXTRAS ? (
              <TouchableOpacity style={styles.extraToggle} onPress={() => setShowStaffExtra((v) => !v)}>
                <Text style={styles.extraToggleText}>
                  {showStaffExtra ? 'Hide extra (waiter phones)' : 'Extra — waiter invite (later)'}
                </Text>
                <Ionicons name={showStaffExtra ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.accent} />
              </TouchableOpacity>
            ) : (
              <Text style={styles.sectionTitle}>Staff Management</Text>
            )}
            {(!isRestaurantBusiness(businessInfo?.business_type) ||
              !HIDE_RESTAURANT_LAUNCH_EXTRAS ||
              showStaffExtra) && (
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>
                    {businessInfo?.business_type === 'restaurant' ? 'Waiter Invite Code' : 'Staff Invite Code'}
                  </Text>
                  <Text style={styles.settingDesc}>
                    {businessInfo?.business_type === 'restaurant' 
                      ? 'Give this 6-digit code to your waiters. They will enter it when logging in to join your restaurant.'
                      : 'Give this 6-digit code to your staff. They will enter it when logging in to join your store.'}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              
              {inviteCode ? (
                <View style={styles.inviteCodeContainer}>
                  <Text style={styles.inviteCodeText}>{inviteCode}</Text>
                  <Text style={styles.inviteCodeSub}>Staff Code Active</Text>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.actionBtn} 
                  onPress={generateInviteCode}
                  disabled={generatingCode}
                >
                  <Ionicons name="key-outline" size={20} color={Colors.accent} />
                  <Text style={styles.actionBtnText}>
                    {generatingCode ? 'Generating...' : 'Generate Invite Code'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Staff PIN (this till)</Text>
            <View style={styles.card}>
              <Text style={[styles.settingDesc, { paddingHorizontal: 16, paddingTop: 12 }]}>
                No SMS. Staff clock in with a 4–6 digit PIN while you stay logged in.
              </Text>
              {staffRows.map((row) => (
                <View key={row.id} style={styles.settingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>
                      {row.display_name} · {row.role}{row.is_active ? '' : ' (off)'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await setStaffActive(row.id, !row.is_active);
                        await loadStaff();
                      } catch (e: any) {
                        Alert.alert('Error', e.message || 'Could not update staff');
                      }
                    }}
                  >
                    <Text style={styles.actionBtnText}>{row.is_active ? 'Disable' : 'Enable'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.divider} />
              <TouchableOpacity style={styles.actionBtn} onPress={() => setStaffModal(true)}>
                <Ionicons name="person-add-outline" size={20} color={Colors.accent} />
                <Text style={styles.actionBtnText}>Add staff PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Hardware Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hardware & Printer</Text>
          <View style={styles.card}>
            
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Paper Size</Text>
                <Text style={styles.settingDesc}>Select your thermal roll width</Text>
              </View>
            </View>

            <View style={styles.toggleContainer}>
              <TouchableOpacity 
                style={[styles.toggleBtn, paperSize === '58mm' && styles.toggleBtnActive]}
                onPress={() => saveSettings('58mm')}
              >
                <Text style={[styles.toggleText, paperSize === '58mm' && styles.toggleTextActive]}>2" (58mm)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.toggleBtn, paperSize === '80mm' && styles.toggleBtnActive]}
                onPress={() => saveSettings('80mm')}
              >
                <Text style={[styles.toggleText, paperSize === '80mm' && styles.toggleTextActive]}>3" (80mm)</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.actionBtn} onPress={handleTestPrint}>
              <Ionicons name="print-outline" size={20} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Test Printer Connection</Text>
            </TouchableOpacity>

          </View>
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, { marginTop: 24, marginBottom: 40 }]}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={Colors.warn} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      <Modal visible={passwordModal} animationType="slide" transparent onRequestClose={closePasswordModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.passwordModalCard}>
            <View style={styles.passwordModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.passwordModalTitle}>Change password</Text>
                <Text style={styles.settingDesc}>Use at least 8 characters and one number.</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={closePasswordModal}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.passwordLabel}>New password</Text>
            <View style={styles.passwordInputRow}>
              <TextInput
                style={styles.passwordInput}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                placeholderTextColor={Colors.textSecondary}
              />
              <TouchableOpacity style={styles.passwordEye} onPress={() => setShowPassword(value => !value)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.passwordLabel}>Confirm password</Text>
            <View style={styles.passwordInputRow}>
              <TextInput
                style={styles.passwordInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                placeholder="Type password again"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>

            {passwordError ? <View style={styles.passwordError}><Text style={styles.passwordErrorText}>{passwordError}</Text></View> : null}
            <TouchableOpacity style={[styles.passwordSave, saving && { opacity: 0.6 }]} onPress={handleChangePassword} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.passwordSaveText}>Save new password</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={staffModal} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: Colors.bg, padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            <Text style={styles.settingLabel}>Add staff</Text>
            <TextInput
              style={{ color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 12, marginTop: 12 }}
              placeholder="Name"
              placeholderTextColor={Colors.textSecondary}
              value={staffName}
              onChangeText={setStaffName}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {(['staff', 'waiter'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.toggleBtn, staffRole === r && styles.toggleBtnActive, { flex: 1 }]}
                  onPress={() => setStaffRole(r)}
                >
                  <Text style={[styles.toggleText, staffRole === r && styles.toggleTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={{ color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 12, marginTop: 12 }}
              placeholder="4–6 digit PIN"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              value={staffPin}
              onChangeText={(t) => setStaffPin(t.replace(/\D/g, '').slice(0, 6))}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 12 }}>
              <TouchableOpacity style={[styles.actionBtn, { flex: 1 }]} onPress={() => setStaffModal(false)}>
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1 }]}
                disabled={savingStaff}
                onPress={async () => {
                  if (!businessInfo?.id) return;
                  setSavingStaff(true);
                  try {
                    await createStaffProfile({
                      businessId: businessInfo.id,
                      displayName: staffName,
                      role: staffRole,
                      pin: staffPin,
                    });
                    setStaffModal(false);
                    setStaffName('');
                    setStaffPin('');
                    await loadStaff();
                  } catch (e: any) {
                    Alert.alert('Error', e.message || 'Could not add staff');
                  } finally {
                    setSavingStaff(false);
                  }
                }}
              >
                {savingStaff ? <ActivityIndicator color={Colors.accent} /> : <Text style={styles.actionBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  
  content: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  extraToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  extraToggleText: { fontSize: 13, color: Colors.accentInk, fontWeight: '600' },
  sectionTitle: { fontSize: 13, textTransform: 'uppercase', color: Colors.textSecondary, fontWeight: '600', letterSpacing: 1, marginBottom: 12, marginLeft: 4 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  
  profileInfo: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accentDim, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700', color: Colors.accent },
  storeName: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  storeType: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  settingRow: { padding: 16, paddingBottom: 12 },
  settingLabel: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  settingDesc: { fontSize: 13, color: Colors.textSecondary },
  
  toggleContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  toggleBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  toggleText: { color: Colors.textPrimary, fontWeight: '600' },
  toggleTextActive: { color: '#fff', fontWeight: '700' },

  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  actionBtnText: { fontSize: 16, fontWeight: '600', color: Colors.accent },

  inviteCodeContainer: { padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  inviteCodeText: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 4 },
  inviteCodeSub: { fontSize: 13, color: Colors.ok, marginTop: 4, fontWeight: '500' },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)', gap: 8 },
  logoutText: { fontSize: 16, fontWeight: '600', color: Colors.warn },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  passwordModalCard: { backgroundColor: Colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  passwordModalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  passwordModalTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  modalClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
  passwordLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 7, marginTop: 10 },
  passwordInputRow: { height: 56, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, backgroundColor: Colors.surface },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: 16, color: Colors.textPrimary, fontSize: 16 },
  passwordEye: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  passwordError: { padding: 12, borderRadius: 8, backgroundColor: 'rgba(201, 162, 39, 0.15)', borderLeftWidth: 3, borderLeftColor: Colors.warn, marginTop: 14 },
  passwordErrorText: { color: Colors.textPrimary, fontSize: 13 },
  passwordSave: { height: 56, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  passwordSaveText: { color: Colors.bg, fontSize: 16, fontWeight: '700' },
});
