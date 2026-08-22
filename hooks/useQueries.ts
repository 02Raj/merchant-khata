import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Activity Item Type for Dashboard
export type ActivityItem = {
  id: string;
  type: 'sale' | 'payment';
  title: string;
  amount: number;
  time: Date;
};

export function useDashboardMetrics(businessId?: string) {
  return useQuery({
    queryKey: ['dashboard', businessId],
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfTodayIso = today.toISOString();

      // 1. Fetch Today's Sales
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('total_amount')
        .eq('business_id', businessId)
        .gte('created_at', startOfTodayIso);

      if (salesError) throw salesError;
      
      const salesToday = salesData.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
      const salesCount = salesData.length;

      // 2. Fetch Receivables
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('customer_id, amount, transaction_type')
        .eq('business_id', businessId)
        .not('customer_id', 'is', null);

      if (ledgerError) throw ledgerError;

      const balances: Record<string, number> = {};
      ledgerData.forEach(txn => {
        const cid = txn.customer_id as string;
        if (!balances[cid]) balances[cid] = 0;
        if (txn.transaction_type === 'debit') balances[cid] += Number(txn.amount);
        if (txn.transaction_type === 'credit') balances[cid] -= Number(txn.amount);
      });

      let receivables = 0;
      let receivablesCount = 0;
      Object.values(balances).forEach(bal => {
        if (bal > 0) {
          receivables += bal;
          receivablesCount++;
        }
      });

      // 3. Fetch Low Stock
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          id, 
          low_stock_threshold,
          inventory_transactions (quantity_change)
        `)
        .eq('business_id', businessId)
        .eq('is_active', true);

      if (productsError) throw productsError;

      let lowStockCount = 0;
      productsData.forEach((p: any) => {
        const stock = p.inventory_transactions?.reduce((sum: number, txn: any) => sum + Number(txn.quantity_change), 0) || 0;
        const threshold = p.low_stock_threshold ? Number(p.low_stock_threshold) : 5;
        if (stock <= threshold) {
          lowStockCount++;
        }
      });

      // 4. Recent Activity
      const { data: recentSales } = await supabase
        .from('sales')
        .select('id, total_amount, created_at, customer_id, customers(name)')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: recentPayments } = await supabase
        .from('payments')
        .select('id, amount, created_at, related_type, related_id')
        .eq('business_id', businessId)
        .eq('direction', 'received')
        .order('created_at', { ascending: false })
        .limit(5);

      const combined: ActivityItem[] = [];
      if (recentSales) {
        recentSales.forEach((s: any) => {
          combined.push({
            id: s.id,
            type: 'sale',
            title: s.customer_id && s.customers?.name ? `Sale to ${s.customers.name}` : `Retail Sale`,
            amount: Number(s.total_amount),
            time: new Date(s.created_at)
          });
        });
      }
      if (recentPayments) {
        recentPayments.forEach((p: any) => {
          combined.push({
            id: p.id,
            type: 'payment',
            title: 'Payment Received',
            amount: Number(p.amount),
            time: new Date(p.created_at)
          });
        });
      }
      combined.sort((a, b) => b.time.getTime() - a.time.getTime());
      
      return {
        salesToday,
        salesCount,
        receivables,
        receivablesCount,
        lowStockCount,
        recentActivity: combined.slice(0, 5)
      };
    },
    enabled: !!businessId,
  });
}

export function useInventory(businessId?: string, isRestaurant: boolean = false) {
  return useQuery({
    queryKey: ['inventory', businessId],
    queryFn: async () => {
      if (!businessId) throw new Error('No business ID');

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          id, name, category, unit, purchase_price, sale_price, low_stock_threshold,
          inventory_transactions (quantity_change)
        `)
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('name');

      if (productsError) throw productsError;

      const products = productsData.map((p: any) => {
        const stock = p.inventory_transactions?.reduce((sum: number, txn: any) => sum + Number(txn.quantity_change), 0) || 0;
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          unit: p.unit,
          purchase_price: Number(p.purchase_price),
          sale_price: Number(p.sale_price),
          low_stock_threshold: p.low_stock_threshold ? Number(p.low_stock_threshold) : 5,
          stockCount: stock
        };
      });

      let rawMaterials: any[] = [];
      if (isRestaurant) {
        const { data: rmData, error: rmError } = await supabase
          .from('raw_materials')
          .select('*')
          .eq('business_id', businessId)
          .order('name');
        if (!rmError && rmData) {
          rawMaterials = rmData;
        }
      }

      return { products, rawMaterials };
    },
    enabled: !!businessId,
  });
}
