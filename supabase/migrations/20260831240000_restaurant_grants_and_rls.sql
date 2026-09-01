-- Restaurant module fixes:
-- 1) GRANT table privileges (fixes "permission denied for table tables/orders")
-- 2) Re-apply Firebase-safe RLS (fixes invalid uuid on Firebase UID like C5VGe9sI...)

-- ── Table privileges (restaurant tables were missing GRANTs) ─────────────────
REVOKE ALL ON TABLE public.tables FROM PUBLIC;
REVOKE ALL ON TABLE public.orders FROM PUBLIC;
REVOKE ALL ON TABLE public.order_items FROM PUBLIC;
REVOKE ALL ON TABLE public.cancel_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.product_variants FROM PUBLIC;
REVOKE ALL ON TABLE public.modifiers FROM PUBLIC;
REVOKE ALL ON TABLE public.recipes FROM PUBLIC;
REVOKE ALL ON TABLE public.raw_materials FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tables TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cancel_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_variants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.modifiers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.raw_materials TO anon, authenticated;

ALTER TABLE public.tables FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cancel_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recipes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials FORCE ROW LEVEL SECURITY;

-- ── Tables ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tables_select ON public.tables;
DROP POLICY IF EXISTS tables_insert ON public.tables;
DROP POLICY IF EXISTS tables_update ON public.tables;
DROP POLICY IF EXISTS tables_delete ON public.tables;

CREATE POLICY tables_select ON public.tables FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY tables_insert ON public.tables FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY tables_update ON public.tables FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY tables_delete ON public.tables FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ── Orders ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS orders_select ON public.orders;
DROP POLICY IF EXISTS orders_insert ON public.orders;
DROP POLICY IF EXISTS orders_delete ON public.orders;

CREATE POLICY orders_select ON public.orders FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY orders_insert ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY orders_delete ON public.orders FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- orders_update kept from 20260831160000 (waiter billing rules)

-- ── Order Items ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS order_items_select ON public.order_items;
DROP POLICY IF EXISTS order_items_insert ON public.order_items;
DROP POLICY IF EXISTS order_items_update ON public.order_items;
DROP POLICY IF EXISTS order_items_delete ON public.order_items;

CREATE POLICY order_items_select ON public.order_items FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY order_items_insert ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY order_items_update ON public.order_items FOR UPDATE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY order_items_delete ON public.order_items FOR DELETE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );

-- ── Cancel Requests ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cancel_requests_select ON public.cancel_requests;
DROP POLICY IF EXISTS cancel_requests_insert ON public.cancel_requests;
DROP POLICY IF EXISTS cancel_requests_delete ON public.cancel_requests;

CREATE POLICY cancel_requests_select ON public.cancel_requests FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE oi.id = order_item_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY cancel_requests_insert ON public.cancel_requests FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE oi.id = order_item_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );
CREATE POLICY cancel_requests_delete ON public.cancel_requests FOR DELETE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE oi.id = order_item_id
        AND public.user_belongs_to_business(o.business_id)
    )
  );

-- ── Product Variants ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS product_variants_select ON public.product_variants;
DROP POLICY IF EXISTS product_variants_insert ON public.product_variants;
DROP POLICY IF EXISTS product_variants_update ON public.product_variants;
DROP POLICY IF EXISTS product_variants_delete ON public.product_variants;

CREATE POLICY product_variants_select ON public.product_variants FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY product_variants_insert ON public.product_variants FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY product_variants_update ON public.product_variants FOR UPDATE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY product_variants_delete ON public.product_variants FOR DELETE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );

-- ── Modifiers ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS modifiers_select ON public.modifiers;
DROP POLICY IF EXISTS modifiers_insert ON public.modifiers;
DROP POLICY IF EXISTS modifiers_update ON public.modifiers;
DROP POLICY IF EXISTS modifiers_delete ON public.modifiers;

CREATE POLICY modifiers_select ON public.modifiers FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY modifiers_insert ON public.modifiers FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY modifiers_update ON public.modifiers FOR UPDATE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY modifiers_delete ON public.modifiers FOR DELETE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );

-- ── Raw Materials ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS raw_materials_select ON public.raw_materials;
DROP POLICY IF EXISTS raw_materials_insert ON public.raw_materials;
DROP POLICY IF EXISTS raw_materials_update ON public.raw_materials;
DROP POLICY IF EXISTS raw_materials_delete ON public.raw_materials;

CREATE POLICY raw_materials_select ON public.raw_materials FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));
CREATE POLICY raw_materials_insert ON public.raw_materials FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY raw_materials_update ON public.raw_materials FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));
CREATE POLICY raw_materials_delete ON public.raw_materials FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ── Recipes ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS recipes_select ON public.recipes;
DROP POLICY IF EXISTS recipes_insert ON public.recipes;
DROP POLICY IF EXISTS recipes_update ON public.recipes;
DROP POLICY IF EXISTS recipes_delete ON public.recipes;

CREATE POLICY recipes_select ON public.recipes FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY recipes_insert ON public.recipes FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY recipes_update ON public.recipes FOR UPDATE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
CREATE POLICY recipes_delete ON public.recipes FOR DELETE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON pv.product_id = p.id
      WHERE pv.id = product_variant_id
        AND public.user_belongs_to_business(p.business_id)
    )
  );
