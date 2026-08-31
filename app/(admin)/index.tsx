import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';
import {
  fetchPlatformBusinesses,
  fetchPlatformOverview,
  fetchPlatformUsers,
  PLATFORM_BUSINESS_TYPES,
  updatePlatformBusinessType,
  type PlatformBusiness,
  type PlatformBusinessType,
  type PlatformOverview,
  type PlatformUser,
} from '@/lib/platformAdmin';
import { Colors } from '@/lib/theme';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function shortUid(uid: string) {
  if (uid.length <= 10) return uid;
  return `${uid.slice(0, 6)}…${uid.slice(-4)}`;
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export default function AdminDashboardScreen() {
  const { session, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [tab, setTab] = useState<'tenants' | 'users'>('tenants');
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<PlatformBusiness | null>(null);
  const [updatingType, setUpdatingType] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [stats, tenantRows, userRows] = await Promise.all([
        fetchPlatformOverview(),
        fetchPlatformBusinesses(),
        fetchPlatformUsers(),
      ]);
      setOverview(stats);
      setBusinesses(tenantRows);
      setUsers(userRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load platform data.');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openTypeModal = (biz: PlatformBusiness) => {
    setSelectedBusiness(biz);
    setTypeModalVisible(true);
  };

  const closeTypeModal = () => {
    if (updatingType) return;
    setTypeModalVisible(false);
    setSelectedBusiness(null);
  };

  const onSelectBusinessType = async (nextType: PlatformBusinessType) => {
    if (!selectedBusiness || updatingType) return;
    if (selectedBusiness.business_type === nextType) {
      closeTypeModal();
      return;
    }

    setUpdatingType(true);
    try {
      const updated = await updatePlatformBusinessType(selectedBusiness.id, nextType);
      setBusinesses((prev) =>
        prev.map((biz) =>
          biz.id === updated.id ? { ...biz, business_type: updated.business_type } : biz,
        ),
      );
      setTypeModalVisible(false);
      setSelectedBusiness(null);
      Alert.alert(
        'Business type updated',
        `${selectedBusiness.name} is now "${nextType}". Merchant must restart app or re-login to see new tabs.`,
      );
    } catch (err) {
      Alert.alert(
        'Update failed',
        err instanceof Error ? err.message : 'Could not update business type. Run the latest migration in Supabase.',
      );
    } finally {
      setUpdatingType(false);
    }
  };

  const typeLabel = (value: string) =>
    PLATFORM_BUSINESS_TYPES.find((t) => t.value === value)?.label ?? value;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.kicker}>OmniBill · Super Admin</Text>
          <Text style={styles.title}>Platform Overview</Text>
          <Text style={styles.subtitle}>{session?.email ?? 'Application owner'}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={() => void signOut()}>
          <Ionicons name="log-out-outline" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorHint}>Run the platform_admin migration in Supabase SQL editor.</Text>
            </View>
          ) : null}

          {overview ? (
            <View style={styles.statsGrid}>
              <StatCard label="Total shops" value={overview.total_businesses} />
              <StatCard label="Total users" value={overview.total_users} />
              <StatCard label="Owners" value={overview.owners} />
              <StatCard
                label="Staff / waiters"
                value={overview.staff}
                hint={`+${overview.users_this_week} users this week`}
              />
              <StatCard
                label="New shops (7d)"
                value={overview.businesses_this_week}
                hint={`${overview.businesses_this_week} tenants joined`}
              />
            </View>
          ) : null}

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'tenants' ? styles.tabBtnActive : null]}
              onPress={() => setTab('tenants')}
            >
              <Text style={[styles.tabText, tab === 'tenants' ? styles.tabTextActive : null]}>
                All tenants ({businesses.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'users' ? styles.tabBtnActive : null]}
              onPress={() => setTab('users')}
            >
              <Text style={[styles.tabText, tab === 'users' ? styles.tabTextActive : null]}>
                All users ({users.length})
              </Text>
            </TouchableOpacity>
          </View>

          {tab === 'tenants' ? (
            <View style={styles.list}>
              {businesses.length === 0 ? (
                <Text style={styles.emptyText}>No tenants registered yet.</Text>
              ) : (
                businesses.map((biz) => (
                  <View key={biz.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{biz.name}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{typeLabel(biz.business_type)}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardMeta}>Owner phone: {biz.owner_phone}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {biz.address}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardFooterText}>{biz.user_count} users</Text>
                      <Text style={styles.cardFooterText}>Joined {formatDate(biz.created_at)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.changeTypeBtn}
                      onPress={() => openTypeModal(biz)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="swap-horizontal-outline" size={16} color={Colors.accentInk} />
                      <Text style={styles.changeTypeText}>Change business type</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          ) : (
            <View style={styles.list}>
              {users.length === 0 ? (
                <Text style={styles.emptyText}>No users registered yet.</Text>
              ) : (
                users.map((user) => (
                  <View key={user.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{user.business_name}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{user.role}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardMeta}>UID: {shortUid(user.user_id)}</Text>
                    <Text style={styles.cardMeta}>Shop phone: {user.owner_phone}</Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardFooterText}>Joined {formatDate(user.joined_at)}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={typeModalVisible} transparent animationType="fade" onRequestClose={closeTypeModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeTypeModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Change business type</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {selectedBusiness?.name ?? 'Tenant'}
            </Text>
            <Text style={styles.modalHint}>
              Pick a mode to test retail, wholesale, hybrid, or restaurant POS with the same phone number.
            </Text>

            <View style={styles.typeList}>
              {PLATFORM_BUSINESS_TYPES.map((option) => {
                const isActive = selectedBusiness?.business_type === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.typeOption, isActive ? styles.typeOptionActive : null]}
                    onPress={() => void onSelectBusinessType(option.value)}
                    disabled={updatingType}
                    activeOpacity={0.8}
                  >
                    <View style={styles.typeOptionHeader}>
                      <Text style={styles.typeOptionLabel}>{option.label}</Text>
                      {isActive ? <Text style={styles.typeOptionCurrent}>Current</Text> : null}
                    </View>
                    <Text style={styles.typeOptionDesc}>{option.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {updatingType ? (
              <ActivityIndicator color={Colors.accent} style={styles.modalLoader} />
            ) : (
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeTypeModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  kicker: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.accentInk,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  signOutBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  statHint: {
    fontSize: 11,
    color: Colors.ok,
    marginTop: 6,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDim,
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: Colors.textPrimary,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  badge: {
    backgroundColor: Colors.accentDim,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    color: Colors.accentInk,
    textTransform: 'capitalize',
  },
  cardMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  cardFooterText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  errorBox: {
    backgroundColor: 'rgba(201, 162, 39, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.warn,
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  errorText: {
    color: Colors.textPrimary,
    fontSize: 13,
  },
  errorHint: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  changeTypeBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  changeTypeText: {
    color: Colors.accentInk,
    fontSize: 13,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.accentInk,
    fontWeight: '500',
  },
  modalHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  typeList: {
    gap: 8,
    marginTop: 4,
  },
  typeOption: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: Colors.bg,
  },
  typeOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDim,
  },
  typeOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  typeOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  typeOptionCurrent: {
    fontSize: 11,
    color: Colors.accentInk,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeOptionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  modalLoader: {
    marginTop: 12,
  },
  modalCancelBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
});
