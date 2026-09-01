import { useMutation, useQueryClient } from '@tanstack/react-query';
import { buildRawMaterialInsertPayload } from '@/lib/restaurantHelpers';
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

export function useCreateRawMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      businessId: string;
      name: string;
      unit: string;
      stockQuantity: number;
    }) => {
      const { data, error } = await supabase
        .from('raw_materials')
        .insert(buildRawMaterialInsertPayload(params))
        .select('id, name, stock_quantity, unit')
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', variables.businessId] });
    },
  });
}

export function useUpdateRawMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      businessId: string;
      id: string;
      name: string;
      unit: string;
    }) => {
      const { error } = await supabase
        .from('raw_materials')
        .update({
          name: params.name.trim(),
          unit: params.unit.trim(),
        })
        .eq('id', params.id);
      if (error) throw error;
      return params;
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', variables.businessId] });
    },
  });
}

export function useAddRawMaterialStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      businessId: string;
      id: string;
      currentStock: number;
      addQuantity: number;
    }) => {
      const nextStock = params.currentStock + params.addQuantity;
      const { error } = await supabase
        .from('raw_materials')
        .update({ stock_quantity: nextStock })
        .eq('id', params.id);
      if (error) throw error;
      return { id: params.id, stock_quantity: nextStock };
    },
    onMutate: async ({ businessId, id, addQuantity }) => {
      await queryClient.cancelQueries({ queryKey: ['inventory', businessId] });
      const previousInventory = queryClient.getQueryData(['inventory', businessId]);
      queryClient.setQueryData(['inventory', businessId], (old: any) => {
        if (!old?.rawMaterials) return old;
        return {
          ...old,
          rawMaterials: old.rawMaterials.map((rm: any) =>
            rm.id === id
              ? { ...rm, stock_quantity: Number(rm.stock_quantity) + addQuantity }
              : rm,
          ),
        };
      });
      return { previousInventory };
    },
    onError: (_err, variables, context) => {
      if (context?.previousInventory) {
        queryClient.setQueryData(['inventory', variables.businessId], context.previousInventory);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', variables.businessId] });
    },
  });
}

export function useDeleteRawMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { businessId: string; id: string }) => {
      const { error } = await supabase.from('raw_materials').delete().eq('id', params.id);
      if (error) throw error;
      return params.id;
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', variables.businessId] });
    },
  });
}
