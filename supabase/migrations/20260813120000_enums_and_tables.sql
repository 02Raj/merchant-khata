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
  created_by text NOT NULL,
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
  created_by text NOT NULL,
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
