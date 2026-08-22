import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Modal, TextInput, Alert, RefreshControl, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import * as Haptics from 'expo-haptics';

type Table = {
  id: string;
  name: string;
  is_active: boolean;
};

type ActiveOrder = {
  id: string;
  table_id: string | null;
  status: 'open' | 'billed';
  total_amount: number;
};

export default function TablesScreen() {
  const router = useRouter();
  const { businessInfo } = useAuth();
  
  const [tables, setTables] = useState<Table[]>([]);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add table modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [savingTable, setSavingTable] = useState(false);

  const fetchTablesAndOrders = async () => {
    if (!businessInfo?.id) return;
    try {
      const [tablesResponse, ordersResponse] = await Promise.all([
        supabase.from('tables').select('*').eq('business_id', businessInfo.id).eq('is_active', true).order('name'),
        supabase.from('orders').select('id, table_id, status, total_amount').eq('business_id', businessInfo.id).in('status', ['open', 'billed'])
      ]);

      if (tablesResponse.error) throw tablesResponse.error;
      if (ordersResponse.error) throw ordersResponse.error;

      setTables(tablesResponse.data || []);
      setActiveOrders(ordersResponse.data || []);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTablesAndOrders();
    }, [businessInfo?.id])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTablesAndOrders();
  };

  const handleAddTable = async () => {
    if (!newTableName.trim()) {
      Alert.alert('Error', 'Table name is required');
      return;
    }
    setSavingTable(true);
    try {
      const { error } = await supabase.from('tables').insert({
        business_id: businessInfo!.id,
        name: newTableName.trim()
      });
      if (error) throw error;
      
      setNewTableName('');
      setAddModalVisible(false);
      fetchTablesAndOrders();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingTable(false);
    }
  };

  const openTable = (table: Table) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const activeOrder = activeOrders.find(o => o.table_id === table.id);
    if (activeOrder) {
      router.push(`/kot/${activeOrder.id}`);
    } else {
      router.push(`/kot/new?tableId=${table.id}&tableName=${encodeURIComponent(table.name)}`);
    }
  };

  const handleTakeaway = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/kot/new?type=takeaway`);
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  // Filter takeaway orders
  const activeTakeaways = activeOrders.filter(o => o.table_id === null);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tables</Text>
        {businessInfo?.role !== 'waiter' && (
          <TouchableOpacity style={styles.addButton} onPress={() => setAddModalVisible(true)}>
            <Ionicons name="add" size={20} color={Colors.bg} />
            <Text style={styles.addButtonText}>Add Table</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        <View style={styles.takeawaySection}>
          <TouchableOpacity style={styles.takeawayButton} onPress={handleTakeaway}>
            <Ionicons name="bag-handle" size={24} color={Colors.bg} />
            <Text style={styles.takeawayButtonText}>New Takeaway (Parcel)</Text>
          </TouchableOpacity>
          
          {activeTakeaways.length > 0 && (
            <View style={styles.activeTakeawaysContainer}>
              <Text style={styles.sectionTitle}>Active Parcels</Text>
              {activeTakeaways.map(order => (
                <TouchableOpacity 
                  key={order.id} 
                  style={[styles.takeawayCard, order.status === 'billed' ? styles.cardBilled : styles.cardOpen]}
                  onPress={() => router.push(`/kot/${order.id}`)}
                >
                  <Ionicons name="bag" size={20} color={Colors.bg} />
                  <Text style={styles.takeawayCardText}>Order #{order.id.substring(0,6)}</Text>
                  <Text style={styles.takeawayCardStatus}>{order.status.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Dine-in Tables</Text>
        <View style={styles.grid}>
          {tables.map(table => {
            const order = activeOrders.find(o => o.table_id === table.id);
            let cardStyle = styles.cardEmpty;
            let iconColor = Colors.ok;
            let statusText = 'Empty';

            if (order) {
              if (order.status === 'billed') {
                cardStyle = styles.cardBilled;
                iconColor = Colors.bg;
                statusText = 'Billed';
              } else {
                cardStyle = styles.cardOpen;
                iconColor = Colors.bg;
                statusText = 'Occupied';
              }
            }

            return (
              <TouchableOpacity 
                key={table.id} 
                style={[styles.tableCard, cardStyle]} 
                onPress={() => openTable(table)}
              >
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableName, order ? styles.textDark : styles.textLight]}>{table.name}</Text>
                  <Ionicons name={order ? "restaurant" : "restaurant-outline"} size={20} color={order ? Colors.bg : Colors.textSecondary} />
                </View>
                <View style={styles.tableFooter}>
                  <Text style={[styles.tableStatus, order ? styles.textDark : styles.textLight]}>{statusText}</Text>
                  {order && order.total_amount > 0 && (
                    <Text style={styles.tableAmount}>₹{Number(order.total_amount).toFixed(2)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        
        {tables.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyStateText}>No tables added yet.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Table Modal */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Table</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Table 1, T2, Outdoor 3"
              placeholderTextColor={Colors.textSecondary}
              value={newTableName}
              onChangeText={setNewTableName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setAddModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleAddTable} disabled={savingTable}>
                {savingTable ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.saveButtonText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: Colors.bg,
    fontWeight: '600',
    marginLeft: 4,
  },
  scrollContent: {
    padding: 20,
  },
  takeawaySection: {
    marginBottom: 24,
  },
  takeawayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentInk,
    padding: 16,
    borderRadius: 12,
  },
  takeawayButtonText: {
    color: Colors.bg,
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  activeTakeawaysContainer: {
    marginTop: 16,
  },
  takeawayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  takeawayCardText: {
    color: Colors.bg,
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  takeawayCardStatus: {
    color: Colors.bg,
    fontWeight: 'bold',
    fontSize: 12,
    opacity: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tableCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    height: 100,
    justifyContent: 'space-between',
  },
  cardEmpty: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  cardOpen: {
    backgroundColor: Colors.warn,
    borderColor: Colors.warn,
  },
  cardBilled: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tableFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  tableStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  tableAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.bg,
  },
  textLight: {
    color: Colors.textPrimary,
  },
  textDark: {
    color: Colors.bg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    color: Colors.textSecondary,
    marginTop: 12,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surfaceRaised,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  saveButtonText: {
    color: Colors.bg,
    fontWeight: '600',
  },
});
