import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { evaluateCreditLimit } from '@/lib/customerKhata';

type Customer = {
  id: string;
  name: string;
  customer_type: 'retail' | 'wholesale';
  balance: number;
  credit_limit: number | null;
};

type Product = {
  id: string;
  name: string;
  sale_price: number;
  wholesale_price: number | null;
  stockCount: number;
  gst_rate: number;
  tax_inclusive: boolean;
  alternate_unit: string | null;
  conversion_factor: number | null;
};

type CartItem = {
  product: Product;
  quantity: number | string;
  unit_price: number;
  is_wholesale_rate: boolean;
  selected_unit: 'base' | 'alternate';
};

export default function SalesScreen() {
  const { session, businessInfo } = useAuth();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Camera Scanner
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerVisible, setScannerVisible] = useState(false);

  // Customer selection & creation state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  
  const [addCustomerModalVisible, setAddCustomerModalVisible] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerType, setNewCustomerType] = useState<'retail' | 'wholesale'>('retail');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  
  // Products search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Hybrid Pricing State
  const [pricingMode, setPricingMode] = useState<'retail' | 'wholesale'>('retail');
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  
  // Checkout state
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [paymentType, setPaymentType] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (businessInfo?.id) {
        fetchCustomers(businessInfo.id);
        fetchProducts(businessInfo.id);
      }
    }, [businessInfo])
  );

  const fetchCustomers = async (bizId: string) => {
    const { data: customersData, error } = await supabase
      .from('customers')
      .select('id, name, customer_type, credit_limit')
      .eq('business_id', bizId)
      .order('name');
      
    if (error) {
      console.error(error);
      return;
    }

    // Now fetch balances from ledger
    const { data: ledgerData, error: ledgerError } = await supabase
      .from('ledger_transactions')
      .select('customer_id, amount, transaction_type')
      .eq('business_id', bizId)
      .not('customer_id', 'is', null);

    if (ledgerError) {
      console.error(ledgerError);
      return;
    }

    const balances: Record<string, number> = {};
    if (ledgerData) {
      ledgerData.forEach(txn => {
        const cid = txn.customer_id as string;
        if (!balances[cid]) balances[cid] = 0;
        if (txn.transaction_type === 'debit') balances[cid] += Number(txn.amount);
        if (txn.transaction_type === 'credit') balances[cid] -= Number(txn.amount);
      });
    }

    const processedCustomers = customersData.map(c => ({
      ...c,
      credit_limit: c.credit_limit != null ? Number(c.credit_limit) : null,
      balance: balances[c.id] || 0
    }));

    setCustomers(processedCustomers);
  };

  const fetchProducts = async (bizId: string) => {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, sale_price, wholesale_price, gst_rate, tax_inclusive, is_active,
        alternate_unit, conversion_factor,
        inventory_transactions(quantity_change)
      `)
      .eq('business_id', bizId)
      .eq('is_active', true)
      .order('name');
      
    if (!error && data) {
      const parsed = data.map((p: any) => {
        const stock = p.inventory_transactions?.reduce((sum: number, tx: any) => sum + Number(tx.quantity_change), 0) || 0;
        return {
          id: p.id,
          name: p.name,
          sale_price: Number(p.sale_price),
          wholesale_price: p.wholesale_price ? Number(p.wholesale_price) : null,
          stockCount: stock,
          gst_rate: Number(p.gst_rate) || 0,
          tax_inclusive: p.tax_inclusive,
          alternate_unit: p.alternate_unit || null,
          conversion_factor: p.conversion_factor ? Number(p.conversion_factor) : null,
        };
      });
      setProducts(parsed);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      Alert.alert('Error', 'Customer name is required.');
      return;
    }
    
    const finalCustomerType = businessInfo?.business_type === 'both' ? newCustomerType : businessInfo?.business_type || 'retail';
    
    setCreatingCustomer(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          business_id: businessInfo!.id,
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || 'N/A', // Using N/A if phone is empty as we set phone NOT NULL in schema
          address: 'N/A', // Required in schema
          customer_type: finalCustomerType
        })
        .select('id, name, customer_type')
        .single();
        
      if (error) throw error;
      
      if (data) {
        const newCust = { ...data, balance: 0 };
        setCustomers(prev => [...prev, newCust]);
        setSelectedCustomer(newCust);
        setPricingMode(newCust.customer_type);
        setAddCustomerModalVisible(false);
        setCustomerModalVisible(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create customer');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const searchedProducts = useMemo(() => {
    if (!searchQuery.trim()) return products; // Return ALL products if no search query
    const lower = searchQuery.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(lower));
  }, [searchQuery, products]);
  
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const lower = customerSearchQuery.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(lower));
  }, [customerSearchQuery, customers]);

  const handleBarcodeScanned = async ({ type, data }: { type: string, data: string }) => {
    setScannerVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    try {
      const { data: productData } = await supabase
        .from('products')
        .select('id')
        .eq('barcode', data)
        .eq('business_id', businessInfo!.id)
        .single();
        
      if (productData) {
        const prod = products.find(p => p.id === productData.id);
        if (prod) {
          addToCart(prod);
          return;
        }
      }
      Alert.alert('Not Found', 'No product linked to this barcode.');
    } catch (e) {
      console.error(e);
      Alert.alert('Not Found', 'No product linked to this barcode.');
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permission needed', 'Camera permission is required to scan barcodes');
        return;
      }
    }
    setScannerVisible(true);
  };

  const addToCart = (product: Product) => {
    const isWholesale = pricingMode === 'wholesale' && product.wholesale_price !== null;
    const priceToUse = isWholesale ? product.wholesale_price! : product.sale_price;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: Number(item.quantity) + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, unit_price: priceToUse, is_wholesale_rate: !!isWholesale, selected_unit: 'base' }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQ = Number(item.quantity) + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const setDirectQuantity = (productId: string, val: string) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        // Allow user to type string, including "."
        return { ...item, quantity: val };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setCart(prev => prev.filter(item => item.product.id !== productId));
    if (cart.length === 1) {
      setCartModalVisible(false); // Close cart if last item is removed
    }
  };

  // Switch cart pricing if customer changes
  useEffect(() => {
    setCart(prev => prev.map(item => {
      const isWholesale = pricingMode === 'wholesale' && item.product.wholesale_price !== null;
      const priceToUse = isWholesale ? item.product.wholesale_price! : item.product.sale_price;
      return { ...item, unit_price: priceToUse, is_wholesale_rate: !!isWholesale };
    }));
  }, [pricingMode]);

  const cartTotals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;

    const itemsForRpc = cart.map(item => {
      const { unit_price, quantity, product, selected_unit } = item;
      const parsedQty = Number(quantity) || 0;
      const isAlt = selected_unit === 'alternate' && product.conversion_factor;
      const effectiveQuantity = isAlt ? parsedQty * product.conversion_factor! : parsedQty;
      
      let basePrice = 0;
      let taxAmount = 0;

      if (product.gst_rate > 0) {
        if (product.tax_inclusive) {
          basePrice = unit_price / (1 + product.gst_rate / 100);
          taxAmount = unit_price - basePrice;
        } else {
          basePrice = unit_price;
          taxAmount = unit_price * (product.gst_rate / 100);
        }
      } else {
        basePrice = unit_price;
      }

      const itemTotalBase = basePrice * effectiveQuantity;
      const itemTotalTax = taxAmount * effectiveQuantity;

      subtotal += itemTotalBase;
      taxTotal += itemTotalTax;

      return {
        product_id: product.id,
        quantity: effectiveQuantity,
        unit_price,
        subtotal: unit_price * effectiveQuantity,
        tax_rate: product.gst_rate,
        tax_amount: taxAmount * effectiveQuantity,
        tax_inclusive: product.tax_inclusive
      };
    });

    let grandTotal = 0;
    let pureTax = 0;

    cart.forEach(item => {
      const parsedQty = Number(item.quantity) || 0;
      const isAlt = item.selected_unit === 'alternate' && item.product.conversion_factor;
      const effectiveQuantity = isAlt ? parsedQty * item.product.conversion_factor! : parsedQty;
      const lineTotal = item.unit_price * effectiveQuantity;
      
      let lineTax = 0;
      if (item.product.gst_rate > 0) {
        if (item.product.tax_inclusive) {
          lineTax = lineTotal - (lineTotal / (1 + item.product.gst_rate / 100));
          grandTotal += lineTotal;
        } else {
          lineTax = lineTotal * (item.product.gst_rate / 100);
          grandTotal += (lineTotal + lineTax);
        }
      } else {
        grandTotal += lineTotal;
      }
      pureTax += lineTax;
    });

    return { grandTotal, taxTotal: pureTax, itemsForRpc };
  }, [cart]);

  const creditLimitStatus = useMemo(() => {
    return evaluateCreditLimit({
      businessType: businessInfo?.business_type,
      currentBalance: selectedCustomer?.balance ?? 0,
      creditLimit: selectedCustomer?.credit_limit ?? null,
      billAmount: cartTotals.grandTotal,
      paymentType,
    });
  }, [businessInfo?.business_type, cartTotals.grandTotal, paymentType, selectedCustomer]);

  const runCheckout = async () => {
    if (cart.length === 0) return;
    if (paymentType === 'credit' && !selectedCustomer) {
      setError('You must select a customer for Credit (Udhaar) sales.');
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('process_checkout', {
        p_business_id: businessInfo!.id,
        p_customer_id: selectedCustomer?.id || null,
        p_created_by: session!.uid,
        p_payment_type: paymentType,
        p_total_amount: cartTotals.grandTotal,
        p_total_tax: cartTotals.taxTotal,
        p_items: cartTotals.itemsForRpc
      });

      if (rpcError) throw rpcError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Prepare snapshot for printing before resetting
      const printSnapshot = {
        customer: selectedCustomer,
        cart: [...cart],
        totals: { ...cartTotals },
        paymentType: paymentType,
        date: new Date().toLocaleString('en-IN')
      };

      // Reset
      setCart([]);
      setSelectedCustomer(null);
      setPricingMode('retail');
      setCheckoutModalVisible(false);
      setCartModalVisible(false);
      setPaymentType('cash');
      
      Alert.alert(
        'Success', 
        'Bill generated successfully!',
        [
          { text: 'Print Receipt', onPress: () => printThermalReceipt(printSnapshot) },
          { text: 'Share PDF', onPress: () => shareBillAsPDF(data, printSnapshot) },
          { text: 'OK', style: 'cancel' }
        ]
      );
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || 'Failed to process checkout');
    } finally {
      setProcessing(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (paymentType === 'credit' && !selectedCustomer) {
      setError('You must select a customer for Credit (Udhaar) sales.');
      return;
    }

    if (creditLimitStatus.exceeded) {
      Alert.alert(
        'Credit limit exceeded',
        creditLimitStatus.message ?? 'This bill crosses the customer credit limit.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Bill anyway', style: 'destructive', onPress: () => void runCheckout() },
        ],
      );
      return;
    }

    await runCheckout();
  };

  const shareBillAsPDF = async (saleId: string, snapshot: any) => {
    try {
      const isWholesaleCustomer = snapshot.customer?.customer_type === 'wholesale';
      const previousBalance = snapshot.customer?.balance || 0;
      const currentBillAmount = snapshot.totals.grandTotal;
      const totalOutstanding = previousBalance + currentBillAmount;

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
              .title { font-size: 24px; font-weight: bold; margin: 0; }
              .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
              .customer { margin-bottom: 20px; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background-color: #f8f8f8; font-weight: bold; }
              .total-row { font-weight: bold; font-size: 16px; }
              .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #888; }
              .wholesale-badge { font-size: 10px; color: #c45c26; margin-left: 5px; border: 1px solid #c45c26; padding: 2px 4px; border-radius: 4px; }
            </style>
          </head>
          <body>
            <div class="header">
              <p class="title">${(businessInfo as any)?.name || 'Retail Invoice'}</p>
              <p class="subtitle">${isWholesaleCustomer ? 'Wholesale Tax Invoice' : 'Tax Invoice'}</p>
            </div>
            
            <div class="customer">
              <strong>Customer:</strong> ${snapshot.customer ? snapshot.customer.name : 'Walk-in (Retail)'}<br/>
              <strong>Date:</strong> ${snapshot.date}<br/>
              <strong>Payment Mode:</strong> ${snapshot.paymentType.toUpperCase()}
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th style="text-align: right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${snapshot.totals.itemsForRpc.map((item: any) => {
                  const cartItem = snapshot.cart.find((c: any) => c.product.id === item.product_id);
                  const prod = cartItem?.product;
                  const isWholesaleRate = cartItem?.is_wholesale_rate;
                  const isAlt = cartItem?.selected_unit === 'alternate' && prod?.conversion_factor;
                  const parsedQty = Number(cartItem?.quantity) || 0;
                  const displayQty = isAlt ? parsedQty + ' ' + prod.alternate_unit : item.quantity;
                  const displayRate = isAlt ? item.unit_price * prod.conversion_factor : item.unit_price;
                  return `
                    <tr>
                      <td>
                        ${prod?.name || 'Item'}
                        ${isWholesaleRate ? '<span class="wholesale-badge">WS Rate</span>' : ''}
                      </td>
                      <td>${displayQty}</td>
                      <td>₹${displayRate.toFixed(2)}</td>
                      <td style="text-align: right">₹${(item.unit_price * item.quantity).toFixed(2)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            
            <div style="text-align: right; margin-top: 20px;">
              <p>Subtotal: ₹${(snapshot.totals.grandTotal - snapshot.totals.taxTotal).toFixed(2)}</p>
              <p>GST Amount: ₹${snapshot.totals.taxTotal.toFixed(2)}</p>
              <p class="total-row">Grand Total: ₹${snapshot.totals.grandTotal.toFixed(2)}</p>
            </div>

            ${isWholesaleCustomer ? `
              <div style="margin-top: 30px; padding: 15px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h3 style="margin-top: 0; color: #111827;">Account Ledger Summary</h3>
                <table style="margin-bottom: 0;">
                  <tr><td>Previous Balance (Udhaar):</td><td style="text-align: right">₹${previousBalance.toFixed(2)}</td></tr>
                  <tr><td>Current Invoice Amount:</td><td style="text-align: right">₹${currentBillAmount.toFixed(2)}</td></tr>
                  <tr class="total-row"><td><strong>Total Payable Balance:</strong></td><td style="text-align: right"><strong>₹${totalOutstanding.toFixed(2)}</strong></td></tr>
                </table>
              </div>
            ` : ''}
            
            <div class="footer">
              <p>Thank you for shopping with us!</p>
              <p>Generated by OmniBill</p>
            </div>
          </body>
        </html>
      `;
      
      const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 }); // A4 dimensions
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to generate bill PDF');
    }
  };

  const printThermalReceipt = async (snapshot: any) => {
    try {
      const savedSize = await AsyncStorage.getItem('printerPaperSize');
      const paperSize = (savedSize === '58mm' || savedSize === '80mm') ? savedSize : '80mm';
      const pxWidth = paperSize === '58mm' ? 210 : 300;

      const isWholesaleCustomer = snapshot.customer?.customer_type === 'wholesale';
      const previousBalance = snapshot.customer?.balance || 0;
      const currentBillAmount = snapshot.totals.grandTotal;
      const totalOutstanding = previousBalance + currentBillAmount;

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
            .bold { font-weight: bold; }
            .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 2px 0; vertical-align: top; }
            th { border-bottom: 1px dashed #000; padding-bottom: 4px; }
            .right { text-align: right; }
            .item-name { max-width: 150px; word-wrap: break-word; }
          </style>
        </head>
        <body>
          <div class="center title">${(businessInfo as any)?.name || 'Retail Store'}</div>
          <div class="center">${isWholesaleCustomer ? 'WHOLESALE INVOICE' : 'TAX INVOICE'}</div>
          <div class="divider"></div>
          <div>
            Date: ${snapshot.date}<br>
            Customer: ${snapshot.customer ? snapshot.customer.name : 'Walk-in'}<br>
            Mode: ${snapshot.paymentType.toUpperCase()}
          </div>
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th class="right">Qty</th>
                <th class="right">Amt</th>
              </tr>
            </thead>
            <tbody>
              ${snapshot.totals.itemsForRpc.map((item: any) => {
                const cartItem = snapshot.cart.find((c: any) => c.product.id === item.product_id);
                const prod = cartItem?.product;
                const isWholesaleRate = cartItem?.is_wholesale_rate;
                const isAlt = cartItem?.selected_unit === 'alternate' && prod?.conversion_factor;
                const parsedQty = Number(cartItem?.quantity) || 0;
                const displayQty = isAlt ? parsedQty + ' ' + prod.alternate_unit : item.quantity;
                
                return `
                  <tr>
                    <td class="item-name">${prod?.name.substring(0,18) || 'Item'}${isWholesaleRate ? '*' : ''}</td>
                    <td class="right">${displayQty}</td>
                    <td class="right">${(item.unit_price * item.quantity).toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="divider"></div>
          <table>
            <tr><td>Subtotal</td><td class="right">${(snapshot.totals.grandTotal - snapshot.totals.taxTotal).toFixed(2)}</td></tr>
            <tr><td>GST</td><td class="right">${snapshot.totals.taxTotal.toFixed(2)}</td></tr>
            <tr><td class="bold">Grand Total</td><td class="right bold">${snapshot.totals.grandTotal.toFixed(2)}</td></tr>
          </table>
          
          ${isWholesaleCustomer ? `
            <div class="divider"></div>
            <div class="center bold">ACCOUNT SUMMARY</div>
            <table>
              <tr><td>Prev Udhaar:</td><td class="right">₹${previousBalance.toFixed(2)}</td></tr>
              <tr><td>This Bill:</td><td class="right">₹${currentBillAmount.toFixed(2)}</td></tr>
              <tr><td class="bold">Total Due:</td><td class="right bold">₹${totalOutstanding.toFixed(2)}</td></tr>
            </table>
          ` : ''}

          <div class="divider"></div>
          <div class="center">Thank you for shopping!</div>
          <div class="center" style="font-size:10px; margin-top:8px;">Generated by OmniBill</div>
        </body>
        </html>
      `;

      await Print.printAsync({ html });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to print thermal receipt');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.kicker}>Point of Sale</Text>
          <Text style={styles.title}>New Bill</Text>
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
          <Ionicons name="barcode-outline" size={24} color={Colors.accent} />
          <Text style={styles.scanBtnText}>Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Customer Picker */}
      <View style={{ paddingHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity style={[styles.customerSelector, { flex: 1 }]} onPress={() => {
          setCustomerSearchQuery('');
          setCustomerModalVisible(true);
        }}>
          <Ionicons name="person" size={20} color={selectedCustomer ? Colors.accent : Colors.textSecondary} />
          <View>
            <Text style={styles.customerLabel}>Customer</Text>
            <Text style={styles.customerName}>{selectedCustomer ? selectedCustomer.name : 'Walk-in (Retail)'}</Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {businessInfo?.business_type === 'both' && (
          <TouchableOpacity 
            style={[
              styles.customerSelector, 
              { paddingHorizontal: 12, backgroundColor: pricingMode === 'wholesale' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)' }
            ]} 
            onPress={() => setPricingMode(prev => prev === 'retail' ? 'wholesale' : 'retail')}
          >
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: Colors.textSecondary, fontWeight: 'bold', textTransform: 'uppercase' }}>Mode</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: pricingMode === 'wholesale' ? Colors.accent : Colors.ok, marginTop: 2 }}>
                {pricingMode === 'wholesale' ? 'Wholesale' : 'Retail'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search products..." 
            placeholderTextColor={Colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Product Grid / List */}
      <View style={styles.mainArea}>
        <FlatList
          data={searchedProducts}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.searchList}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.searchResultItem} onPress={() => addToCart(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.searchResultName}>{item.name}</Text>
                <Text style={styles.searchResultStock}>Stock: {item.stockCount}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.searchResultPrice}>₹{item.sale_price.toFixed(2)}</Text>
                {businessInfo?.business_type !== 'retail' && item.wholesale_price !== null && (
                  <Text style={styles.searchResultWholesale}>Wholesale: ₹{item.wholesale_price.toFixed(2)}</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptySearchText}>{products.length === 0 ? "You have no active products. Add some in the Products tab." : "No products match your search."}</Text>
          }
        />
      </View>

      {/* Sticky Cart Footer Bar */}
      {cart.length > 0 && (
        <View style={styles.stickyCartFooter}>
          <View>
            <Text style={styles.stickyCartText}>{cart.length} Item{cart.length > 1 ? 's' : ''}</Text>
            <Text style={styles.stickyCartTotal}>₹{cartTotals.grandTotal.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.stickyCartBtn} onPress={() => setCartModalVisible(true)}>
            <Text style={styles.stickyCartBtnText}>View Cart</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.bg} />
          </TouchableOpacity>
        </View>
      )}

      {/* Cart Modal */}
      <Modal visible={cartModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Your Cart</Text>
            <TouchableOpacity onPress={() => setCartModalVisible(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={cart}
            keyExtractor={item => item.product.id}
            contentContainerStyle={styles.cartList}
            renderItem={({ item }) => (
              <View style={styles.cartItem}>
                <View style={styles.cartItemMain}>
                  <Text style={styles.cartItemName}>{item.product.name}</Text>
                  
                  {item.product.alternate_unit ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 4 }}>
                      <TouchableOpacity 
                        style={[styles.unitToggleBtn, item.selected_unit === 'base' && styles.unitToggleBtnActive]}
                        onPress={() => setCart(prev => prev.map(c => c.product.id === item.product.id ? { ...c, selected_unit: 'base' } : c))}
                      >
                        <Text style={[styles.unitToggleText, item.selected_unit === 'base' && styles.unitToggleTextActive]}>Piece</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.unitToggleBtn, item.selected_unit === 'alternate' && styles.unitToggleBtnActive]}
                        onPress={() => setCart(prev => prev.map(c => c.product.id === item.product.id ? { ...c, selected_unit: 'alternate' } : c))}
                      >
                        <Text style={[styles.unitToggleText, item.selected_unit === 'alternate' && styles.unitToggleTextActive]}>{item.product.alternate_unit}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <Text style={styles.cartItemPrice}>
                    ₹{(item.selected_unit === 'alternate' && item.product.conversion_factor ? item.unit_price * item.product.conversion_factor : item.unit_price).toFixed(2)} 
                    {businessInfo?.business_type === 'both' && item.is_wholesale_rate && <Text style={styles.wholesaleBadge}> (Wholesale)</Text>}
                  </Text>
                  {item.product.gst_rate > 0 && (
                    <Text style={styles.cartItemTax}>
                      +{item.product.gst_rate}% GST {item.product.tax_inclusive ? '(Inc)' : '(Exc)'}
                    </Text>
                  )}
                </View>
                <View style={styles.qtyControl}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.product.id, -1)}>
                    <Ionicons name="remove" size={20} color={Colors.textPrimary} />
                  </TouchableOpacity>
                  <TextInput 
                    style={styles.qtyInput}
                    value={item.quantity.toString()}
                    onChangeText={(val) => setDirectQuantity(item.product.id, val)}
                    keyboardType="decimal-pad"
                    selectTextOnFocus={true}
                  />
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.product.id, 1)}>
                    <Ionicons name="add" size={20} color={Colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => removeFromCart(item.product.id)}>
                  <Ionicons name="trash-outline" size={20} color={Colors.warn} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Cart is empty</Text>}
          />
          {cart.length > 0 && (
            <View style={styles.checkoutFooter}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>GST Amount</Text>
                <Text style={styles.totalsValue}>₹{cartTotals.taxTotal.toFixed(2)}</Text>
              </View>
              <View style={[styles.totalsRow, { marginBottom: 16 }]}>
                <Text style={styles.grandTotalLabel}>Grand Total</Text>
                <Text style={styles.grandTotalValue}>₹{cartTotals.grandTotal.toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.chargeButton} onPress={() => setCheckoutModalVisible(true)}>
                <Text style={styles.chargeButtonText}>Charge ₹{cartTotals.grandTotal.toFixed(2)}</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.bg} />
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Customer Selection Modal */}
      <Modal visible={customerModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Customer</Text>
            <TouchableOpacity onPress={() => setCustomerModalVisible(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchSection}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
              <TextInput 
                style={styles.searchInput} 
                placeholder="Search by name..." 
                placeholderTextColor={Colors.textSecondary}
                value={customerSearchQuery}
                onChangeText={setCustomerSearchQuery}
              />
              {customerSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setCustomerSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <FlatList
            data={filteredCustomers}
            keyExtractor={c => c.id}
            ListHeaderComponent={
              !customerSearchQuery ? (
                <TouchableOpacity style={styles.customerRow} onPress={() => { setSelectedCustomer(null); setPricingMode('retail'); setCustomerModalVisible(false); }}>
                  <View style={[styles.customerAvatar, { backgroundColor: Colors.surfaceRaised }]}>
                    <Ionicons name="walk" size={20} color={Colors.textSecondary} />
                  </View>
                  <View>
                    <Text style={styles.customerRowName}>Walk-in Customer</Text>
                    <Text style={styles.customerRowType}>Retail</Text>
                  </View>
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.customerRow} onPress={() => { 
                setSelectedCustomer(item); 
                setPricingMode(item.customer_type);
                setCustomerModalVisible(false); 
              }}>
                <View style={styles.customerAvatar}>
                  <Text style={styles.customerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.customerRowName}>{item.name}</Text>
                  <Text style={styles.customerRowType}>{item.customer_type.toUpperCase()}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyCustomerContainer}>
                <Text style={styles.emptyCustomerText}>No customer found.</Text>
                <TouchableOpacity style={styles.addCustomerBtn} onPress={() => setAddCustomerModalVisible(true)}>
                  <Ionicons name="person-add" size={18} color={Colors.bg} />
                  <Text style={styles.addCustomerBtnText}>Add New Customer</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Add New Customer Sub-Modal */}
      <Modal visible={addCustomerModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.checkoutOverlay}>
          <View style={styles.checkoutSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>New Customer</Text>
              <TouchableOpacity onPress={() => setAddCustomerModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>Customer Name *</Text>
              <TextInput style={styles.inputField} value={newCustomerName} onChangeText={setNewCustomerName} placeholder="E.g. Ramesh" placeholderTextColor={Colors.textSecondary} />
            </View>
            <View style={{ marginBottom: 24 }}>
              <Text style={styles.inputLabel}>Phone Number (Optional)</Text>
              <TextInput style={styles.inputField} value={newCustomerPhone} onChangeText={setNewCustomerPhone} placeholder="E.g. 9876543210" keyboardType="phone-pad" placeholderTextColor={Colors.textSecondary} />
            </View>
            {businessInfo?.business_type === 'both' && (
              <View style={{ marginBottom: 32 }}>
                <Text style={styles.inputLabel}>Customer Type</Text>
                <View style={styles.typeToggleContainer}>
                  <TouchableOpacity style={[styles.typeToggleBtn, newCustomerType === 'retail' && styles.typeToggleBtnActive]} onPress={() => setNewCustomerType('retail')}>
                    <Text style={[styles.typeToggleText, newCustomerType === 'retail' && styles.typeToggleTextActive]}>Retail</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.typeToggleBtn, newCustomerType === 'wholesale' && styles.typeToggleBtnActive]} onPress={() => setNewCustomerType('wholesale')}>
                    <Text style={[styles.typeToggleText, newCustomerType === 'wholesale' && styles.typeToggleTextActive]}>Wholesale</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <TouchableOpacity style={styles.confirmButton} onPress={handleCreateCustomer} disabled={creatingCustomer}>
              {creatingCustomer ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.confirmButtonText}>Save & Select Customer</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Checkout Payment Modal */}
      <Modal visible={checkoutModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.checkoutOverlay}>
          <View style={styles.checkoutSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Checkout</Text>
              <TouchableOpacity onPress={() => setCheckoutModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.checkoutAmount}>₹{cartTotals.grandTotal.toFixed(2)}</Text>

            <Text style={styles.paymentMethodLabel}>Select Payment Method</Text>
            <View style={styles.paymentMethods}>
              <TouchableOpacity style={[styles.paymentBtn, paymentType === 'cash' && styles.paymentBtnActive]} onPress={() => setPaymentType('cash')}>
                <Ionicons name="cash" size={24} color={paymentType === 'cash' ? Colors.bg : Colors.textPrimary} />
                <Text style={[styles.paymentBtnText, paymentType === 'cash' && styles.paymentBtnTextActive]}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentBtn, paymentType === 'upi' && styles.paymentBtnActive]} onPress={() => setPaymentType('upi')}>
                <Ionicons name="qr-code" size={24} color={paymentType === 'upi' ? Colors.bg : Colors.textPrimary} />
                <Text style={[styles.paymentBtnText, paymentType === 'upi' && styles.paymentBtnTextActive]}>UPI</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentBtn, paymentType === 'credit' && styles.paymentBtnActive]} onPress={() => setPaymentType('credit')}>
                <Ionicons name="book" size={24} color={paymentType === 'credit' ? Colors.bg : Colors.warn} />
                <Text style={[styles.paymentBtnText, paymentType === 'credit' && styles.paymentBtnTextActive]}>Udhaar</Text>
              </TouchableOpacity>
            </View>

            {creditLimitStatus.applies && creditLimitStatus.creditLimit ? (
              <View style={styles.creditLimitInfo}>
                <Text style={styles.creditLimitInfoText}>
                  Limit: ₹ {creditLimitStatus.creditLimit.toLocaleString('en-IN')}
                  {' · '}After bill: ₹ {creditLimitStatus.projectedBalance.toLocaleString('en-IN')}
                </Text>
              </View>
            ) : null}

            {creditLimitStatus.exceeded ? (
              <View style={styles.creditLimitWarning}>
                <Ionicons name="warning" size={18} color={Colors.warn} />
                <Text style={styles.creditLimitWarningText}>{creditLimitStatus.message}</Text>
              </View>
            ) : null}

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.confirmButton} onPress={handleCheckout} disabled={processing}>
              {processing ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.confirmButtonText}>Confirm & Print Bill</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Scanner Modal */}
      <Modal
        visible={scannerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setScannerVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Scan Barcode</Text>
            <TouchableOpacity onPress={() => setScannerVisible(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {scannerVisible && (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39"]
                }}
                onBarcodeScanned={handleBarcodeScanned}
              >
                <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                  <View style={{ width: 250, height: 250, borderWidth: 2, borderColor: Colors.accent, backgroundColor: 'transparent' }} />
                  <Text style={{ color: '#fff', marginTop: 20, fontSize: 16 }}>Align barcode within the square</Text>
                </View>
              </CameraView>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  headerTitleContainer: { flex: 1 },
  kicker: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: Colors.accentInk, marginBottom: 4, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  customerSelector: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  customerLabel: { fontSize: 11, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  customerName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  searchSection: { padding: 16, paddingBottom: 0 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 12, height: 50, borderWidth: 1, borderColor: Colors.border },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: Colors.textPrimary },
  mainArea: { flex: 1 },
  searchList: { padding: 16, gap: 8 },
  searchResultItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  searchResultName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  searchResultStock: { fontSize: 13, color: Colors.textSecondary },
  searchResultPrice: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },
  searchResultWholesale: { fontSize: 11, color: Colors.accent, marginTop: 4, textAlign: 'right' },
  emptySearchText: { textAlign: 'center', color: Colors.textSecondary, marginTop: 24 },
  
  // Cart Sticky Footer
  stickyCartFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surfaceRaised, padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16, borderTopWidth: 1, borderTopColor: Colors.border },
  stickyCartText: { fontSize: 14, color: Colors.textSecondary },
  stickyCartTotal: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  stickyCartBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, gap: 8 },
  stickyCartBtnText: { color: Colors.bg, fontSize: 16, fontWeight: '700' },
  
  cartList: { padding: 16, gap: 12 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  cartItemMain: { flex: 1 },
  cartItemName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  cartItemPrice: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  wholesaleBadge: { color: Colors.accent, fontSize: 11 },
  cartItemTax: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  unitToggleBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: Colors.surface },
  unitToggleBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  unitToggleText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  unitToggleTextActive: { color: Colors.bg, fontWeight: '600' },
  qtyControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, marginHorizontal: 12 },
  qtyBtn: { padding: 8 },
  qtyText: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, width: 24, textAlign: 'center' },
  qtyInput: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, minWidth: 40, textAlign: 'center', padding: 0, margin: 0 },
  deleteBtn: { padding: 8 },
  
  checkoutFooter: { backgroundColor: Colors.surface, padding: 20, borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: Platform.OS === 'ios' ? 32 : 20 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalsLabel: { fontSize: 14, color: Colors.textSecondary },
  totalsValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  grandTotalLabel: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  grandTotalValue: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  chargeButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.accent, padding: 16, borderRadius: 12, gap: 8 },
  chargeButtonText: { color: Colors.bg, fontSize: 18, fontWeight: '700' },
  
  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  modalClose: { padding: 4 },
  customerRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  customerAvatarText: { color: Colors.bg, fontSize: 18, fontWeight: '600' },
  customerRowName: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  customerRowType: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyCustomerContainer: { padding: 32, alignItems: 'center' },
  emptyCustomerText: { fontSize: 16, color: Colors.textSecondary, marginBottom: 16 },
  addCustomerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, gap: 8 },
  addCustomerBtnText: { color: Colors.bg, fontSize: 16, fontWeight: '600' },
  
  inputLabel: { fontSize: 14, color: Colors.textSecondary, marginBottom: 8, fontWeight: '500' },
  inputField: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, fontSize: 16, color: Colors.textPrimary },
  typeToggleContainer: { flexDirection: 'row', backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  typeToggleBtn: { flex: 1, padding: 14, alignItems: 'center' },
  typeToggleBtnActive: { backgroundColor: Colors.surfaceRaised },
  typeToggleText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  typeToggleTextActive: { color: Colors.textPrimary },
  
  checkoutOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  checkoutSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  checkoutAmount: { fontSize: 48, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: 32 },
  paymentMethodLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 12 },
  paymentMethods: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  paymentBtn: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, gap: 8 },
  paymentBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  paymentBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  paymentBtnTextActive: { color: Colors.bg },
  errorBox: { backgroundColor: 'rgba(201, 162, 39, 0.1)', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.warn },
  errorText: { color: Colors.textPrimary, fontSize: 13 },
  confirmButton: { backgroundColor: Colors.ok, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  confirmButtonText: { color: Colors.bg, fontSize: 18, fontWeight: '700' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border
  },
  scanBtnText: {
    color: Colors.accent,
    fontWeight: '600',
  },
  creditLimitInfo: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  creditLimitInfoText: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  creditLimitWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(201, 162, 39, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.warn,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  creditLimitWarningText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
});
