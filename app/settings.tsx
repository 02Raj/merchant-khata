import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Haptics from 'expo-haptics';

import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  const { businessInfo, signOut } = useAuth();
  
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('80mm');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
    if (businessInfo?.id && businessInfo?.role === 'owner') {
      fetchInviteCode();
    }
  }, [businessInfo]);

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
        <div class="center title">${(businessInfo as any)?.name || 'MERCHANT KHATA'}</div>
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
              </View>
            </View>
          </View>
        </View>

        {/* Staff Management Section */}
        {businessInfo?.role === 'owner' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Staff Management</Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Waiter Invite Code</Text>
                  <Text style={styles.settingDesc}>Give this 6-digit code to your waiters. They will enter it when logging in to join your restaurant.</Text>
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
});
