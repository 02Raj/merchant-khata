-- Membership helpers + RLS on every tenant-owned table.
-- Client-supplied business_id is never sufficient: policies call these functions.

CREATE OR REPLACE FUNCTION public.user_belongs_to_business(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_business_id IS NOT NULL
    AND (auth.jwt() ->> 'sub') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.business_users AS bu
      WHERE bu.business_id = p_business_id
        AND bu.user_id = (auth.jwt() ->> 'sub')
    );
$$;

CREATE OR REPLACE FUNCTION public.user_is_business_owner(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_business_id IS NOT NULL
    AND (auth.jwt() ->> 'sub') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.business_users AS bu
      WHERE bu.business_id = p_business_id
        AND bu.user_id = (auth.jwt() ->> 'sub')
        AND bu.role = 'owner'
    );
$$;

REVOKE ALL ON FUNCTION public.user_belongs_to_business(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_business_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_business(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_business_owner(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.user_belongs_to_business(uuid) IS
  'True iff auth.jwt()->>sub has a business_users row for this tenant. Used by RLS; do not trust client business_id alone.';

-- First owner: insert membership as the creating user. Runs as definer so it is not blocked by RLS.
CREATE OR REPLACE FUNCTION public.add_owner_on_business_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (auth.jwt() ->> 'sub') IS NULL THEN
    RAISE EXCEPTION 'business insert requires an authenticated user';
  END IF;
  INSERT INTO public.business_users (business_id, user_id, role)
  VALUES (NEW.id, (auth.jwt() ->> 'sub'), 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_add_owner
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.add_owner_on_business_insert();

-- Line-item tenancy helpers (sale_items / purchase_items have no business_id column)
CREATE OR REPLACE FUNCTION public.user_can_access_sale(p_sale_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales AS s
    WHERE s.id = p_sale_id
      AND public.user_belongs_to_business(s.business_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_purchase(p_purchase_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.purchases AS p
    WHERE p.id = p_purchase_id
      AND public.user_belongs_to_business(p.business_id)
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_sale(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_purchase(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_sale(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_purchase(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable + FORCE RLS (table owner cannot skip policies)
-- ---------------------------------------------------------------------------
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases FORCE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions FORCE ROW LEVEL SECURITY;

-- Privileges: authenticated only. anon has no table access.
REVOKE ALL ON TABLE public.businesses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.business_users FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.products FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.customers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.suppliers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sales FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sale_items FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.purchases FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.purchase_items FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ledger_transactions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.inventory_transactions FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.businesses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchases TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ledger_transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_transactions TO anon, authenticated;

-- ========================= businesses =========================
-- INSERT is allowed for any signed-in user (new shop). Membership is created by trigger.
-- SELECT/UPDATE/DELETE still require membership / owner — client cannot pick another tenant.

CREATE POLICY businesses_select ON public.businesses
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(id));

CREATE POLICY businesses_insert ON public.businesses
  FOR INSERT TO anon, authenticated
  WITH CHECK ((auth.jwt() ->> 'sub') IS NOT NULL);

CREATE POLICY businesses_update ON public.businesses
  FOR UPDATE TO anon, authenticated
  USING (public.user_is_business_owner(id))
  WITH CHECK (public.user_is_business_owner(id));

CREATE POLICY businesses_delete ON public.businesses
  FOR DELETE TO anon, authenticated
  USING (public.user_is_business_owner(id));

-- ========================= business_users =========================
CREATE POLICY business_users_select ON public.business_users
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- Owners invite staff. Bootstrap of first owner is the AFTER INSERT trigger (definer).
CREATE POLICY business_users_insert ON public.business_users
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_is_business_owner(business_id));

CREATE POLICY business_users_update ON public.business_users
  FOR UPDATE TO anon, authenticated
  USING (public.user_is_business_owner(business_id))
  WITH CHECK (public.user_is_business_owner(business_id));

CREATE POLICY business_users_delete ON public.business_users
  FOR DELETE TO anon, authenticated
  USING (public.user_is_business_owner(business_id));

-- ========================= products =========================
CREATE POLICY products_select ON public.products
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY products_insert ON public.products
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY products_update ON public.products
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY products_delete ON public.products
  FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ========================= customers =========================
CREATE POLICY customers_select ON public.customers
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY customers_insert ON public.customers
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY customers_update ON public.customers
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY customers_delete ON public.customers
  FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ========================= suppliers =========================
CREATE POLICY suppliers_select ON public.suppliers
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY suppliers_insert ON public.suppliers
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY suppliers_update ON public.suppliers
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY suppliers_delete ON public.suppliers
  FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ========================= sales =========================
CREATE POLICY sales_select ON public.sales
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY sales_insert ON public.sales
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY sales_update ON public.sales
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY sales_delete ON public.sales
  FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ========================= sale_items (tenancy via parent sale) =========================
CREATE POLICY sale_items_select ON public.sale_items
  FOR SELECT TO anon, authenticated
  USING (public.user_can_access_sale(sale_id));

CREATE POLICY sale_items_insert ON public.sale_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_can_access_sale(sale_id));

CREATE POLICY sale_items_update ON public.sale_items
  FOR UPDATE TO anon, authenticated
  USING (public.user_can_access_sale(sale_id))
  WITH CHECK (public.user_can_access_sale(sale_id));

CREATE POLICY sale_items_delete ON public.sale_items
  FOR DELETE TO anon, authenticated
  USING (public.user_can_access_sale(sale_id));

-- ========================= purchases =========================
CREATE POLICY purchases_select ON public.purchases
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY purchases_insert ON public.purchases
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY purchases_update ON public.purchases
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY purchases_delete ON public.purchases
  FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ========================= purchase_items =========================
CREATE POLICY purchase_items_select ON public.purchase_items
  FOR SELECT TO anon, authenticated
  USING (public.user_can_access_purchase(purchase_id));

CREATE POLICY purchase_items_insert ON public.purchase_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_can_access_purchase(purchase_id));

CREATE POLICY purchase_items_update ON public.purchase_items
  FOR UPDATE TO anon, authenticated
  USING (public.user_can_access_purchase(purchase_id))
  WITH CHECK (public.user_can_access_purchase(purchase_id));

CREATE POLICY purchase_items_delete ON public.purchase_items
  FOR DELETE TO anon, authenticated
  USING (public.user_can_access_purchase(purchase_id));

-- ========================= payments =========================
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY payments_delete ON public.payments
  FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ========================= ledger_transactions =========================
CREATE POLICY ledger_transactions_select ON public.ledger_transactions
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY ledger_transactions_insert ON public.ledger_transactions
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY ledger_transactions_update ON public.ledger_transactions
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY ledger_transactions_delete ON public.ledger_transactions
  FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

-- ========================= inventory_transactions =========================
CREATE POLICY inventory_transactions_select ON public.inventory_transactions
  FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY inventory_transactions_insert ON public.inventory_transactions
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY inventory_transactions_update ON public.inventory_transactions
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY inventory_transactions_delete ON public.inventory_transactions
  FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));
