import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useAddStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ businessId, productId, quantity, reason = 'Quick Restock' }: { businessId: string, productId: string, quantity: number, reason?: string }) => {
      const { error } = await supabase
        .from('inventory_transactions')
        .insert({
          business_id: businessId,
          product_id: productId,
          quantity_change: quantity,
          reason,
          source_type: 'adjustment',
          source_id: productId
        });
      if (error) throw error;
      return { productId, quantity };
    },
    onMutate: async ({ businessId, productId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: ['inventory', businessId] });

      const previousInventory = queryClient.getQueryData(['inventory', businessId]);

      // Optimistically update
      queryClient.setQueryData(['inventory', businessId], (old: any) => {
        if (!old || !old.products) return old;
        return {
          ...old,
          products: old.products.map((p: any) => 
            p.id === productId ? { ...p, stockCount: p.stockCount + quantity } : p
          )
        };
      });

      return { previousInventory };
    },
    onError: (err, variables, context) => {
      // Rollback
      if (context?.previousInventory) {
        queryClient.setQueryData(['inventory', variables.businessId], context.previousInventory);
      }
    },
    onSettled: (data, error, variables) => {
      // Invalidate to fetch fresh data
      queryClient.invalidateQueries({ queryKey: ['inventory', variables.businessId] });
    },
  });
}
