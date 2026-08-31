-- Fix RLS policies that used auth.uid() (Supabase UUID) instead of Firebase JWT sub (text).
-- Firebase UIDs like "C5VGe9slCZbvdZJCQd5FF0yN2P63" are NOT valid PostgreSQL UUIDs,
-- causing: invalid input syntax for type uuid.

-- ── Tables ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tables_select ON public.tables;
DROP POLICY IF EXISTS tables_insert ON public.tables;
DROP POLICY IF EXISTS tables_update ON public.tables;
DROP POLICY IF EXISTS tables_delete ON public.tables;

CREATE POLICY tables_select ON public.tables FOR SELECT
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY tables_insert ON public.tables FOR INSERT
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY tables_update ON public.tables FOR UPDATE
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY tables_delete ON public.tables FOR DELETE
  USING (public.user_belongs_to_business(business_id));

-- ── Orders (orders_update already fixed in 20260831160000) ──────────────────
DROP POLICY IF EXISTS orders_select ON public.orders;
DROP POLICY IF EXISTS orders_insert ON public.orders;
DROP POLICY IF EXISTS orders_delete ON public.orders;

CREATE POLICY orders_select ON public.orders FOR SELECT
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY orders_insert ON public.orders FOR INSERT
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY orders_delete ON public.orders FOR DELETE
  USING (public.user_belongs_to_business(business_id));

-- ── Order Items ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS order_items_select ON public.order_items;
DROP POLICY IF EXISTS order_items_insert ON public.order_items;
DROP POLICY IF EXISTS order_items_update ON public.order_items;
DROP POLICY IF EXISTS order_items_delete ON public.order_items;

CREATE POLICY order_items_select ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY order_items_insert ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY order_items_update ON public.order_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY order_items_delete ON public.order_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );

-- ── Cancel Requests (cancel_requests_update already fixed in 20260831160000) ─
DROP POLICY IF EXISTS cancel_requests_select ON public.cancel_requests;
DROP POLICY IF EXISTS cancel_requests_insert ON public.cancel_requests;
DROP POLICY IF EXISTS cancel_requests_delete ON public.cancel_requests;

CREATE POLICY cancel_requests_select ON public.cancel_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE oi.id = order_item_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY cancel_requests_insert ON public.cancel_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE oi.id = order_item_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY cancel_requests_delete ON public.cancel_requests FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE oi.id = order_item_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );

-- ── Raw Materials ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS raw_materials_select ON public.raw_materials;
DROP POLICY IF EXISTS raw_materials_insert ON public.raw_materials;
DROP POLICY IF EXISTS raw_materials_update ON public.raw_materials;
DROP POLICY IF EXISTS raw_materials_delete ON public.raw_materials;

CREATE POLICY raw_materials_select ON public.raw_materials FOR SELECT
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY raw_materials_insert ON public.raw_materials FOR INSERT
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY raw_materials_update ON public.raw_materials FOR UPDATE
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY raw_materials_delete ON public.raw_materials FOR DELETE
  USING (public.user_belongs_to_business(business_id));

-- ── Product Variants ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS product_variants_select ON public.product_variants;
DROP POLICY IF EXISTS product_variants_insert ON public.product_variants;
DROP POLICY IF EXISTS product_variants_update ON public.product_variants;
DROP POLICY IF EXISTS product_variants_delete ON public.product_variants;

CREATE POLICY product_variants_select ON public.product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY product_variants_insert ON public.product_variants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY product_variants_update ON public.product_variants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY product_variants_delete ON public.product_variants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );

-- ── Recipes ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS recipes_select ON public.recipes;
DROP POLICY IF EXISTS recipes_insert ON public.recipes;
DROP POLICY IF EXISTS recipes_update ON public.recipes;
DROP POLICY IF EXISTS recipes_delete ON public.recipes;

CREATE POLICY recipes_select ON public.recipes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY recipes_insert ON public.recipes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY recipes_update ON public.recipes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY recipes_delete ON public.recipes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );

-- ── Modifiers ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS modifiers_select ON public.modifiers;
DROP POLICY IF EXISTS modifiers_insert ON public.modifiers;
DROP POLICY IF EXISTS modifiers_update ON public.modifiers;
DROP POLICY IF EXISTS modifiers_delete ON public.modifiers;

CREATE POLICY modifiers_select ON public.modifiers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY modifiers_insert ON public.modifiers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY modifiers_update ON public.modifiers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY modifiers_delete ON public.modifiers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );

-- ── Expenses ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS expenses_select ON public.expenses;
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
DROP POLICY IF EXISTS expenses_update ON public.expenses;
DROP POLICY IF EXISTS expenses_delete ON public.expenses;

CREATE POLICY expenses_select ON public.expenses FOR SELECT
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY expenses_insert ON public.expenses FOR INSERT
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY expenses_update ON public.expenses FOR UPDATE
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY expenses_delete ON public.expenses FOR DELETE
  USING (public.user_belongs_to_business(business_id));

-- ── Staff join RPC ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_business_as_staff(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bus_id UUID;
  v_business_type public.business_type;
  v_role public.business_role;
BEGIN
  IF (auth.jwt() ->> 'sub') IS NULL THEN
    RAISE EXCEPTION 'Authentication required to join a business';
  END IF;

  SELECT id, business_type INTO v_bus_id, v_business_type
  FROM public.businesses
  WHERE invite_code = p_code;

  IF v_bus_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Invite Code';
  END IF;

  v_role := CASE
    WHEN v_business_type = 'restaurant' THEN 'waiter'::public.business_role
    ELSE 'staff'::public.business_role
  END;

  INSERT INTO public.business_users (business_id, user_id, role)
  VALUES (v_bus_id, (auth.jwt() ->> 'sub'), v_role)
  ON CONFLICT (business_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
