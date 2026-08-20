DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
-- Merchant Desk MVP — enums, tables, foreign keys
-- Apply via Supabase CLI or SQL editor. Does not DROP existing objects.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.business_type AS ENUM ('retail', 'wholesale', 'both');
CREATE TYPE public.business_role AS ENUM ('owner', 'staff');
CREATE TYPE public.sale_payment_type AS ENUM ('cash', 'upi', 'credit', 'partial');
CREATE TYPE public.payment_direction AS ENUM ('received', 'paid');
CREATE TYPE public.customer_type AS ENUM ('cash', 'credit');
CREATE TYPE public.ledger_entry_type AS ENUM ('debit', 'credit');

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_phone text NOT NULL,
  address text NOT NULL,
  business_type public.business_type NOT NULL,
  gstin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT businesses_owner_phone_not_blank CHECK (char_length(trim(owner_phone)) > 0)
);

CREATE TABLE public.business_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role public.business_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_users_unique_membership UNIQUE (business_id, user_id)
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  purchase_price numeric(12, 2) NOT NULL,
  sale_price numeric(12, 2) NOT NULL,
  wholesale_price numeric(12, 2),
  moq numeric(12, 3),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT products_prices_non_negative CHECK (
    purchase_price >= 0
    AND sale_price >= 0
    AND (wholesale_price IS NULL OR wholesale_price >= 0)
  ),
  CONSTRAINT products_moq_positive CHECK (moq IS NULL OR moq > 0)
);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  customer_type public.customer_type NOT NULL,
  credit_limit numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT customers_credit_limit_non_negative CHECK (credit_limit IS NULL OR credit_limit >= 0)
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers (id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  total_amount numeric(12, 2) NOT NULL,
  payment_type public.sale_payment_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_total_non_negative CHECK (total_amount >= 0)
);

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity numeric(12, 3) NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  subtotal numeric(12, 2) NOT NULL,
  CONSTRAINT sale_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sale_items_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT sale_items_subtotal_non_negative CHECK (subtotal >= 0)
);

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  total_amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchases_total_non_negative CHECK (total_amount >= 0)
);

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity numeric(12, 3) NOT NULL,
  unit_cost numeric(12, 2) NOT NULL,
  subtotal numeric(12, 2) NOT NULL,
  CONSTRAINT purchase_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT purchase_items_unit_cost_non_negative CHECK (unit_cost >= 0),
  CONSTRAINT purchase_items_subtotal_non_negative CHECK (subtotal >= 0)
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  related_type text NOT NULL,
  related_id uuid NOT NULL,
  amount numeric(12, 2) NOT NULL,
  direction public.payment_direction NOT NULL,
  method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_related_type_known CHECK (
    related_type IN ('sale', 'purchase', 'customer', 'supplier')
  ),
  CONSTRAINT payments_method_not_blank CHECK (char_length(trim(method)) > 0)
);

CREATE TABLE public.ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers (id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  transaction_type public.ledger_entry_type NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_amount_positive CHECK (amount > 0),
  CONSTRAINT ledger_party_xor CHECK (
    (customer_id IS NOT NULL AND supplier_id IS NULL)
    OR (customer_id IS NULL AND supplier_id IS NOT NULL)
  ),
  CONSTRAINT ledger_source_type_known CHECK (
    source_type IN ('sale', 'purchase', 'payment', 'opening')
  )
);

CREATE TABLE public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity_change numeric(12, 3) NOT NULL,
  reason text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_quantity_change_nonzero CHECK (quantity_change <> 0),
  CONSTRAINT inventory_reason_not_blank CHECK (char_length(trim(reason)) > 0),
  CONSTRAINT inventory_source_type_known CHECK (
    source_type IN ('sale', 'purchase', 'adjustment', 'return')
  )
);

-- Same-tenant FKs: child party/product must belong to the parent document's business
CREATE OR REPLACE FUNCTION public.enforce_same_business_customer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = NEW.customer_id AND c.business_id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'customer_id does not belong to business_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_same_business_supplier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = NEW.supplier_id AND s.business_id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'supplier_id does not belong to business_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sale_item_same_business()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.sales s
    JOIN public.products p ON p.id = NEW.product_id
    WHERE s.id = NEW.sale_id
      AND p.business_id = s.business_id
  ) THEN
    RAISE EXCEPTION 'sale_item product and sale must share business_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_purchase_item_same_business()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchases pu
    JOIN public.products p ON p.id = NEW.product_id
    WHERE pu.id = NEW.purchase_id
      AND p.business_id = pu.business_id
  ) THEN
    RAISE EXCEPTION 'purchase_item product and purchase must share business_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_inventory_same_business()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.business_id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'product_id does not belong to business_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_same_business_customer
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_business_customer();

CREATE TRIGGER purchases_same_business_supplier
  BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_business_supplier();

CREATE TRIGGER ledger_same_business_customer
  BEFORE INSERT OR UPDATE ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_business_customer();

CREATE TRIGGER ledger_same_business_supplier
  BEFORE INSERT OR UPDATE ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_business_supplier();

CREATE TRIGGER sale_items_same_business
  BEFORE INSERT OR UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_item_same_business();

CREATE TRIGGER purchase_items_same_business
  BEFORE INSERT OR UPDATE ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_item_same_business();

CREATE TRIGGER inventory_same_business_product
  BEFORE INSERT OR UPDATE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_same_business();
-- Indexes on tenant keys and hot foreign keys

CREATE INDEX idx_business_users_business_id ON public.business_users (business_id);
CREATE INDEX idx_business_users_user_id ON public.business_users (user_id);

CREATE INDEX idx_products_business_id ON public.products (business_id);
CREATE INDEX idx_products_business_id_active ON public.products (business_id) WHERE is_active;
CREATE INDEX idx_products_business_id_category ON public.products (business_id, category);

CREATE INDEX idx_customers_business_id ON public.customers (business_id);
CREATE INDEX idx_customers_business_id_phone ON public.customers (business_id, phone);

CREATE INDEX idx_suppliers_business_id ON public.suppliers (business_id);
CREATE INDEX idx_suppliers_business_id_phone ON public.suppliers (business_id, phone);

CREATE INDEX idx_sales_business_id ON public.sales (business_id);
CREATE INDEX idx_sales_customer_id ON public.sales (customer_id);
CREATE INDEX idx_sales_created_by ON public.sales (created_by);
CREATE INDEX idx_sales_business_id_created_at ON public.sales (business_id, created_at DESC);

CREATE INDEX idx_sale_items_sale_id ON public.sale_items (sale_id);
CREATE INDEX idx_sale_items_product_id ON public.sale_items (product_id);

CREATE INDEX idx_purchases_business_id ON public.purchases (business_id);
CREATE INDEX idx_purchases_supplier_id ON public.purchases (supplier_id);
CREATE INDEX idx_purchases_created_by ON public.purchases (created_by);
CREATE INDEX idx_purchases_business_id_created_at ON public.purchases (business_id, created_at DESC);

CREATE INDEX idx_purchase_items_purchase_id ON public.purchase_items (purchase_id);
CREATE INDEX idx_purchase_items_product_id ON public.purchase_items (product_id);

CREATE INDEX idx_payments_business_id ON public.payments (business_id);
CREATE INDEX idx_payments_related ON public.payments (related_type, related_id);
CREATE INDEX idx_payments_business_id_created_at ON public.payments (business_id, created_at DESC);

CREATE INDEX idx_ledger_business_id ON public.ledger_transactions (business_id);
CREATE INDEX idx_ledger_customer_id ON public.ledger_transactions (customer_id);
CREATE INDEX idx_ledger_supplier_id ON public.ledger_transactions (supplier_id);
CREATE INDEX idx_ledger_source ON public.ledger_transactions (source_type, source_id);
CREATE INDEX idx_ledger_business_id_created_at ON public.ledger_transactions (business_id, created_at DESC);

CREATE INDEX idx_inventory_business_id ON public.inventory_transactions (business_id);
CREATE INDEX idx_inventory_product_id ON public.inventory_transactions (product_id);
CREATE INDEX idx_inventory_source ON public.inventory_transactions (source_type, source_id);
CREATE INDEX idx_inventory_business_id_created_at ON public.inventory_transactions (business_id, created_at DESC);
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

