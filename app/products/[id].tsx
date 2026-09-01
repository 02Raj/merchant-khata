import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';

type Variant = { id: string; name: string; price: number };
type Modifier = { id: string; name: string; extra_price: number };
type RawMaterial = { id: string; name: string; unit: string };
type Recipe = { id: string; product_variant_id: string; raw_material_id: string; quantity_required: number; raw_material?: RawMaterial };

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { businessInfo } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<any>(null);
  
  const [variants, setVariants] = useState<Variant[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  
  const [newVarName, setNewVarName] = useState('');
  const [newVarPrice, setNewVarPrice] = useState('');
  
  const [newModName, setNewModName] = useState('');
  const [newModPrice, setNewModPrice] = useState('');

  // Recipe Mapping State
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedRawMaterial, setSelectedRawMaterial] = useState('');
  const [recipeQty, setRecipeQty] = useState('');

  useEffect(() => {
    fetchProductDetails();
  }, [id]);

  const fetchProductDetails = async () => {
    setLoading(true);
    try {
      const [pRes, vRes, mRes, rmRes, recRes] = await Promise.all([
        supabase.from('products').select('*').eq('id', id).single(),
        supabase.from('product_variants').select('*').eq('product_id', id),
        supabase.from('modifiers').select('*').eq('product_id', id),
        supabase.from('raw_materials').select('*').eq('business_id', businessInfo?.id),
        supabase.from('recipes').select('*, raw_material:raw_materials(*)')
          // We fetch all recipes for variants of this product. Since we don't have a direct product_id on recipes, 
          // we will filter them in JS or just fetch all for business, but let's just fetch all and filter in JS if needed.
          // Wait, recipes policy restricts by business_id automatically via joins.
      ]);
      
      if (pRes.error) throw pRes.error;
      
      setProduct(pRes.data);
      setVariants(vRes.data || []);
      setModifiers(mRes.data || []);
      setRawMaterials(rmRes.data || []);
      
      if (recRes.data) {
        // filter recipes to only those whose variant is in our variants list
        const vIds = (vRes.data || []).map(v => v.id);
        setRecipes(recRes.data.filter(r => vIds.includes(r.product_variant_id)));
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const addVariant = async () => {
    if (!newVarName || !newVarPrice) return;
    try {
      const { data, error } = await supabase.from('product_variants').insert({
        product_id: id,
        name: newVarName,
        price: parseFloat(newVarPrice)
      }).select().single();
      
      if (error) throw error;
      setVariants([...variants, data]);
      setNewVarName('');
      setNewVarPrice('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteVariant = async (vid: string) => {
    try {
      const { error } = await supabase.from('product_variants').delete().eq('id', vid);
      if (error) throw error;
      setVariants(variants.filter(v => v.id !== vid));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const addModifier = async () => {
    if (!newModName) return;
    try {
      const { data, error } = await supabase.from('modifiers').insert({
        product_id: id,
        name: newModName,
        extra_price: parseFloat(newModPrice) || 0
      }).select().single();
      
      if (error) throw error;
      setModifiers([...modifiers, data]);
      setNewModName('');
      setNewModPrice('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteModifier = async (mid: string) => {
    try {
      const { error } = await supabase.from('modifiers').delete().eq('id', mid);
      if (error) throw error;
      setModifiers(modifiers.filter(m => m.id !== mid));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const toggleAvailability = async () => {
    try {
      const newVal = !product.is_available_today;
      const { error } = await supabase.from('products').update({ is_available_today: newVal }).eq('id', id);
      if (error) throw error;
      setProduct({ ...product, is_available_today: newVal });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const openRecipeModal = (variant: Variant) => {
    setSelectedVariant(variant);
    setSelectedRawMaterial('');
    setRecipeQty('');
    setRecipeModalVisible(true);
  };

  const addRecipe = async () => {
    if (!selectedVariant || !selectedRawMaterial || !recipeQty) return;
    try {
      const { data, error } = await supabase.from('recipes').insert({
        product_variant_id: selectedVariant.id,
        raw_material_id: selectedRawMaterial,
        quantity_required: parseFloat(recipeQty)
      }).select('*, raw_material:raw_materials(*)').single();
      
      if (error) throw error;
      setRecipes([...recipes, data]);
      setRecipeQty('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteRecipe = async (rid: string) => {
    try {
      const { error } = await supabase.from('recipes').delete().eq('id', rid);
      if (error) throw error;
      setRecipes(recipes.filter(r => r.id !== rid));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.accent} /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{product?.name}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Availability Toggle */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Available Today</Text>
            <TouchableOpacity 
              style={[styles.toggleBtn, product?.is_available_today ? styles.toggleOn : styles.toggleOff]}
              onPress={toggleAvailability}
            >
              <Text style={styles.toggleText}>{product?.is_available_today ? 'YES' : 'NO (86\'d)'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Variants Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sizes & Variants</Text>
          <Text style={styles.desc}>Add sizes like Regular, Medium, Large. (Base price is used if no variants exist).</Text>
          
          {variants.map(v => (
            <View key={v.id} style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{v.name}</Text>
                <Text style={styles.itemSub}>₹{v.price}</Text>
              </View>
              <TouchableOpacity style={styles.recipeBtn} onPress={() => openRecipeModal(v)}>
                <Ionicons name="nutrition" size={16} color={Colors.bg} />
                <Text style={styles.recipeBtnText}>BOM</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteVariant(v.id)} style={{ marginLeft: 16 }}>
                <Ionicons name="trash" size={20} color={Colors.warn} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.addRow}>
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="Name (e.g. Medium)" value={newVarName} onChangeText={setNewVarName} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="₹ Price" keyboardType="numeric" value={newVarPrice} onChangeText={setNewVarPrice} />
            <TouchableOpacity style={styles.addBtn} onPress={addVariant}>
              <Ionicons name="add" size={24} color={Colors.bg} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Modifiers Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Add-ons & Modifiers</Text>
          <Text style={styles.desc}>e.g., Extra Cheese (+₹50), Less Spicy (+₹0)</Text>
          
          {modifiers.map(m => (
            <View key={m.id} style={styles.listItem}>
              <View>
                <Text style={styles.itemTitle}>{m.name}</Text>
                <Text style={styles.itemSub}>+₹{m.extra_price}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteModifier(m.id)}>
                <Ionicons name="trash" size={20} color={Colors.warn} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.addRow}>
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="Name (e.g. Extra Cheese)" value={newModName} onChangeText={setNewModName} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="₹ Extra" keyboardType="numeric" value={newModPrice} onChangeText={setNewModPrice} />
            <TouchableOpacity style={styles.addBtn} onPress={addModifier}>
              <Ionicons name="add" size={24} color={Colors.bg} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Recipe (BOM) Modal */}
      {recipeModalVisible && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Recipe for {selectedVariant?.name}</Text>
              <TouchableOpacity onPress={() => setRecipeModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.desc}>Add raw materials required to make 1 unit of this size.</Text>
            
            <ScrollView style={{ maxHeight: 200, marginBottom: 16 }}>
              {recipes.filter(r => r.product_variant_id === selectedVariant?.id).map(r => (
                <View key={r.id} style={styles.listItem}>
                  <Text style={styles.itemTitle}>{r.raw_material?.name} ({r.quantity_required} {r.raw_material?.unit})</Text>
                  <TouchableOpacity onPress={() => deleteRecipe(r.id)}>
                    <Ionicons name="trash" size={18} color={Colors.warn} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Select Raw Material</Text>
              {rawMaterials.length === 0 ? (
                <Text style={styles.desc}>
                  No raw materials yet. Go to Inventory → Raw Materials tab → Add Material (paneer, butter, etc.)
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {rawMaterials.map(rm => (
                    <TouchableOpacity 
                      key={rm.id} 
                      style={[styles.chip, selectedRawMaterial === rm.id && styles.chipSelected]}
                      onPress={() => setSelectedRawMaterial(rm.id)}
                    >
                      <Text style={[styles.chipText, selectedRawMaterial === rm.id && styles.chipTextSelected]}>
                        {rm.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Quantity Required (in {rawMaterials.find(r => r.id === selectedRawMaterial)?.unit || 'unit'})</Text>
              <TextInput 
                style={styles.input} 
                keyboardType="numeric" 
                value={recipeQty} 
                onChangeText={setRecipeQty}
                placeholder="e.g. 150"
              />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={addRecipe}>
              <Text style={styles.primaryBtnText}>Add to Recipe</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 16, color: Colors.textPrimary },
  content: { padding: 16 },
  card: { backgroundColor: Colors.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
  desc: { color: Colors.textSecondary, fontSize: 13, marginBottom: 16 },
  toggleBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  toggleOn: { backgroundColor: Colors.ok },
  toggleOff: { backgroundColor: Colors.warn },
  toggleText: { color: Colors.bg, fontWeight: 'bold', fontSize: 12 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surfaceRaised, padding: 12, borderRadius: 8, marginBottom: 8 },
  itemTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  itemSub: { fontSize: 14, color: Colors.textSecondary },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, height: 44, color: Colors.textPrimary },
  addBtn: { backgroundColor: Colors.accent, width: 44, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  recipeBtn: { backgroundColor: Colors.textSecondary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, gap: 4 },
  recipeBtnText: { color: Colors.bg, fontSize: 12, fontWeight: 'bold' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, minHeight: 400 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
  label: { fontSize: 14, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
  formGroup: { marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  chipSelected: { backgroundColor: Colors.accentDim, borderColor: Colors.accent },
  chipText: { color: Colors.textPrimary, fontSize: 13 },
  chipTextSelected: { color: Colors.accent, fontWeight: 'bold' },
  primaryBtn: { backgroundColor: Colors.accent, padding: 16, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: Colors.bg, fontWeight: 'bold', fontSize: 16 }
});
