import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useTables(businessId?: string) {
  return useQuery({
    queryKey: ['tables', businessId],
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID');

      const [tablesRes, ordersRes] = await Promise.all([
        supabase.from('tables').select('*').eq('business_id', businessId).eq('is_active', true).order('name'),
        supabase.from('orders').select('id, table_id, status, total_amount').eq('business_id', businessId).in('status', ['open', 'billed'])
      ]);

      if (tablesRes.error) throw tablesRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const activeOrders = ordersRes.data || [];
      const takeaways = activeOrders.filter((o: any) => o.table_id === null);
      const tables = (tablesRes.data || []).map((table: any) => {
        const tableOrder = activeOrders.find((o: any) => o.table_id === table.id);
        return {
          ...table,
          orderStatus: tableOrder?.status || 'empty',
          orderAmount: tableOrder?.total_amount || 0,
          orderId: tableOrder?.id || null
        };
      });

      return { tables, takeaways };
    },
    enabled: !!businessId,
  });
}

export function useSalesProducts(businessId?: string) {
  return useQuery({
    queryKey: ['salesProducts', businessId],
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID');

      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, sale_price, wholesale_price, gst_rate, tax_inclusive, is_active,
          inventory_transactions(quantity_change)
        `)
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name');
        
      if (error) throw error;

      return data.map((p: any) => {
        const stock = p.inventory_transactions?.reduce((sum: number, tx: any) => sum + Number(tx.quantity_change), 0) || 0;
        return {
          id: p.id,
          name: p.name,
          sale_price: Number(p.sale_price),
          wholesale_price: p.wholesale_price ? Number(p.wholesale_price) : null,
          stockCount: stock,
          gst_rate: Number(p.gst_rate) || 0,
          tax_inclusive: p.tax_inclusive,
        };
      });
    },
    enabled: !!businessId,
  });
}

export function useCustomers(businessId?: string) {
  return useQuery({
    queryKey: ['customers', businessId],
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID');

      const { data: customersData, error } = await supabase
        .from('customers')
        .select('id, name, phone, customer_type')
        .eq('business_id', businessId)
        .order('name');
        
      if (error) throw error;

      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('customer_id, amount, transaction_type')
        .eq('business_id', businessId)
        .not('customer_id', 'is', null);

      if (ledgerError) throw ledgerError;

      const balances: Record<string, number> = {};
      if (ledgerData) {
        ledgerData.forEach(txn => {
          const cid = txn.customer_id as string;
          if (!balances[cid]) balances[cid] = 0;
          if (txn.transaction_type === 'debit') balances[cid] += Number(txn.amount);
          if (txn.transaction_type === 'credit') balances[cid] -= Number(txn.amount);
        });
      }

      return customersData.map(c => ({
        ...c,
        balance: balances[c.id] || 0
      }));
    },
    enabled: !!businessId,
  });
}

export function useSuppliers(businessId?: string) {
  return useQuery({
    queryKey: ['suppliers', businessId],
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID');

      const { data: suppliersData, error: suppError } = await supabase
        .from('suppliers')
        .select('id, name, phone')
        .eq('business_id', businessId)
        .order('name');

      if (suppError) throw suppError;

      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('supplier_id, amount, transaction_type')
        .eq('business_id', businessId)
        .not('supplier_id', 'is', null);

      if (ledgerError) throw ledgerError;

      const balances: Record<string, number> = {};
      ledgerData.forEach(txn => {
        const sid = txn.supplier_id as string;
        if (!balances[sid]) balances[sid] = 0;
        if (txn.transaction_type === 'credit') balances[sid] += Number(txn.amount);
        if (txn.transaction_type === 'debit') balances[sid] -= Number(txn.amount);
      });

      return suppliersData.map(s => ({
        ...s,
        balance: balances[s.id] || 0
      }));
    },
    enabled: !!businessId,
  });
}
