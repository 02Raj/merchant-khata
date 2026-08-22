-- Migration: Recipes, Variants, and Modifiers Add-on

-- 1. Raw Materials
CREATE TABLE public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stock_quantity NUMERIC DEFAULT 0,
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Product Variants
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Recipes (Bill of Materials)
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id UUID NOT NULL REFERENCES public.product_variants (id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials (id) ON DELETE CASCADE,
  quantity_required NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Modifiers
CREATE TABLE public.modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  extra_price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Update Order Items
ALTER TABLE public.order_items 
  ADD COLUMN product_variant_id UUID NULL REFERENCES public.product_variants (id) ON DELETE SET NULL,
  ADD COLUMN modifier_ids UUID[] NULL;

-- Indexes
CREATE INDEX idx_raw_materials_business_id ON public.raw_materials (business_id);
CREATE INDEX idx_product_variants_product_id ON public.product_variants (product_id);
CREATE INDEX idx_recipes_product_variant_id ON public.recipes (product_variant_id);
CREATE INDEX idx_modifiers_product_id ON public.modifiers (product_id);
CREATE INDEX idx_order_items_product_variant_id ON public.order_items (product_variant_id);

-- RLS Setup
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;

-- Shared RLS logic: user must be part of business_users for the business_id
-- Raw Materials
CREATE POLICY raw_materials_select ON public.raw_materials FOR SELECT USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY raw_materials_insert ON public.raw_materials FOR INSERT WITH CHECK (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY raw_materials_update ON public.raw_materials FOR UPDATE USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));
CREATE POLICY raw_materials_delete ON public.raw_materials FOR DELETE USING (business_id IN (SELECT bu.business_id FROM public.business_users bu WHERE bu.user_id = auth.uid()::text));

-- Product Variants (Join with products -> business_users)
CREATE POLICY product_variants_select ON public.product_variants FOR SELECT USING (
  product_id IN (SELECT p.id FROM public.products p JOIN public.business_users bu ON p.business_id = bu.business_id WHERE bu.user_id = auth.uid()::text)
);
CREATE POLICY product_variants_insert ON public.product_variants FOR INSERT WITH CHECK (
  product_id IN (SELECT p.id FROM public.products p JOIN public.business_users bu ON p.business_id = bu.business_id WHERE bu.user_id = auth.uid()::text)
);
CREATE POLICY product_variants_update ON public.product_variants FOR UPDATE USING (
  product_id IN (SELECT p.id FROM public.products p JOIN public.business_users bu ON p.business_id = bu.business_id WHERE bu.user_id = auth.uid()::text)
);
CREATE POLICY product_variants_delete ON public.product_variants FOR DELETE USING (
  product_id IN (SELECT p.id FROM public.products p JOIN public.business_users bu ON p.business_id = bu.business_id WHERE bu.user_id = auth.uid()::text)
);

-- Recipes (Join with product_variants -> products -> business_users)
CREATE POLICY recipes_select ON public.recipes FOR SELECT USING (
  product_variant_id IN (
    SELECT pv.id FROM public.product_variants pv 
    JOIN public.products p ON pv.product_id = p.id 
    JOIN public.business_users bu ON p.business_id = bu.business_id 
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY recipes_insert ON public.recipes FOR INSERT WITH CHECK (
  product_variant_id IN (
    SELECT pv.id FROM public.product_variants pv 
    JOIN public.products p ON pv.product_id = p.id 
    JOIN public.business_users bu ON p.business_id = bu.business_id 
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY recipes_update ON public.recipes FOR UPDATE USING (
  product_variant_id IN (
    SELECT pv.id FROM public.product_variants pv 
    JOIN public.products p ON pv.product_id = p.id 
    JOIN public.business_users bu ON p.business_id = bu.business_id 
    WHERE bu.user_id = auth.uid()::text
  )
);
CREATE POLICY recipes_delete ON public.recipes FOR DELETE USING (
  product_variant_id IN (
    SELECT pv.id FROM public.product_variants pv 
    JOIN public.products p ON pv.product_id = p.id 
    JOIN public.business_users bu ON p.business_id = bu.business_id 
    WHERE bu.user_id = auth.uid()::text
  )
);

-- Modifiers (Join with products -> business_users)
CREATE POLICY modifiers_select ON public.modifiers FOR SELECT USING (
  product_id IN (SELECT p.id FROM public.products p JOIN public.business_users bu ON p.business_id = bu.business_id WHERE bu.user_id = auth.uid()::text)
);
CREATE POLICY modifiers_insert ON public.modifiers FOR INSERT WITH CHECK (
  product_id IN (SELECT p.id FROM public.products p JOIN public.business_users bu ON p.business_id = bu.business_id WHERE bu.user_id = auth.uid()::text)
);
CREATE POLICY modifiers_update ON public.modifiers FOR UPDATE USING (
  product_id IN (SELECT p.id FROM public.products p JOIN public.business_users bu ON p.business_id = bu.business_id WHERE bu.user_id = auth.uid()::text)
);
CREATE POLICY modifiers_delete ON public.modifiers FOR DELETE USING (
  product_id IN (SELECT p.id FROM public.products p JOIN public.business_users bu ON p.business_id = bu.business_id WHERE bu.user_id = auth.uid()::text)
);
