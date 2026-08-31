-- Retail P2: bill discount, split/partial payment, sale returns, enhanced checkout

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upi_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_amount numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS returned_quantity numeric(12, 3) NOT NULL DEFAULT 0;

ALTER TABLE public.ledger_transactions
  DROP CONSTRAINT IF EXISTS ledger_source_type_known;

ALTER TABLE public.ledger_transactions
  ADD CONSTRAINT ledger_source_type_known CHECK (
    source_type IN ('sale', 'purchase', 'payment', 'opening', 'return')
  );

CREATE TABLE IF NOT EXISTS public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales (id) ON DELETE RESTRICT,
  total_amount numeric(12, 2) NOT NULL,
  refund_cash numeric(12, 2) NOT NULL DEFAULT 0,
  refund_upi numeric(12, 2) NOT NULL DEFAULT 0,
  refund_credit numeric(12, 2) NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_returns_total_non_negative CHECK (total_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.sale_returns (id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity numeric(12, 3) NOT NULL,
  subtotal numeric(12, 2) NOT NULL,
  CONSTRAINT sale_return_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sale_return_items_subtotal_non_negative CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_business_id ON public.sale_returns (business_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON public.sale_returns (sale_id);

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items FORCE ROW LEVEL SECURITY;

CREATE POLICY sale_returns_select ON public.sale_returns
  FOR SELECT USING (public.user_belongs_to_business(business_id));

CREATE POLICY sale_return_items_select ON public.sale_return_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sale_returns sr
      WHERE sr.id = return_id
        AND public.user_belongs_to_business(sr.business_id)
    )
  );

DROP FUNCTION IF EXISTS public.process_checkout(uuid, uuid, text, public.sale_payment_type, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.process_checkout(
  p_business_id uuid,
  p_customer_id uuid,
  p_created_by text,
  p_payment_type public.sale_payment_type,
  p_total_amount numeric,
  p_total_tax numeric,
  p_items jsonb,
  p_discount numeric DEFAULT 0,
  p_cash_amount numeric DEFAULT NULL,
  p_upi_amount numeric DEFAULT NULL,
  p_credit_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale_id uuid;
  item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_stock numeric;
  v_product_name text;
  v_cash numeric := 0;
  v_upi numeric := 0;
  v_credit numeric := 0;
  v_discount numeric := COALESCE(p_discount, 0);
BEGIN
  IF NOT public.user_belongs_to_business(p_business_id) THEN
    RAISE EXCEPTION 'User does not belong to business';
  END IF;

  IF v_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  IF p_payment_type = 'credit' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer must be selected for credit sales';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = p_customer_id AND business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'Customer does not belong to this business';
    END IF;
  END IF;

  IF p_cash_amount IS NULL AND p_upi_amount IS NULL AND p_credit_amount IS NULL THEN
    CASE p_payment_type
      WHEN 'cash' THEN v_cash := p_total_amount;
      WHEN 'upi' THEN v_upi := p_total_amount;
      WHEN 'credit' THEN v_credit := p_total_amount;
      WHEN 'partial' THEN
        RAISE EXCEPTION 'Payment split amounts are required for partial payment';
      ELSE
        RAISE EXCEPTION 'Unsupported payment type';
    END CASE;
  ELSE
    v_cash := COALESCE(p_cash_amount, 0);
    v_upi := COALESCE(p_upi_amount, 0);
    v_credit := COALESCE(p_credit_amount, 0);
  END IF;

  IF round(v_cash + v_upi + v_credit, 2) <> round(p_total_amount, 2) THEN
    RAISE EXCEPTION 'Payment split (%) must equal bill total (%)', v_cash + v_upi + v_credit, p_total_amount;
  END IF;

  IF v_credit > 0 AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer must be selected when bill has udhaar portion';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (item->>'product_id')::uuid;
    v_qty := (item->>'quantity')::numeric;

    SELECT COALESCE(SUM(it.quantity_change), 0), p.name
    INTO v_stock, v_product_name
    FROM public.products p
    LEFT JOIN public.inventory_transactions it
      ON it.product_id = p.id AND it.business_id = p_business_id
    WHERE p.id = v_product_id AND p.business_id = p_business_id
    GROUP BY p.name;

    IF v_product_name IS NULL THEN
      RAISE EXCEPTION 'Product not found for this business';
    END IF;

    IF v_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % (available %, requested %)', v_product_name, v_stock, v_qty;
    END IF;
  END LOOP;

  INSERT INTO public.sales (
    business_id,
    customer_id,
    created_by,
    total_amount,
    total_tax,
    payment_type,
    discount_amount,
    cash_amount,
    upi_amount,
    credit_amount
  ) VALUES (
    p_business_id,
    p_customer_id,
    p_created_by,
    p_total_amount,
    p_total_tax,
    p_payment_type,
    v_discount,
    v_cash,
    v_upi,
    v_credit
  ) RETURNING id INTO v_sale_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal,
      tax_rate,
      tax_amount,
      tax_inclusive
    ) VALUES (
      v_sale_id,
      (item->>'product_id')::uuid,
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'subtotal')::numeric,
      (item->>'tax_rate')::numeric,
      (item->>'tax_amount')::numeric,
      (item->>'tax_inclusive')::boolean
    );

    INSERT INTO public.inventory_transactions (
      business_id,
      product_id,
      quantity_change,
      reason,
      source_type,
      source_id
    ) VALUES (
      p_business_id,
      (item->>'product_id')::uuid,
      -((item->>'quantity')::numeric),
      'Sale #' || substr(v_sale_id::text, 1, 8),
      'sale',
      v_sale_id
    );
  END LOOP;

  IF v_credit > 0 THEN
    INSERT INTO public.ledger_transactions (
      business_id,
      customer_id,
      supplier_id,
      amount,
      transaction_type,
      source_type,
      source_id
    ) VALUES (
      p_business_id,
      p_customer_id,
      NULL,
      v_credit,
      'debit',
      'sale',
      v_sale_id
    );
  END IF;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_checkout(
  uuid, uuid, text, public.sale_payment_type, numeric, numeric, jsonb, numeric, numeric, numeric, numeric
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_sale_return(
  p_business_id uuid,
  p_sale_id uuid,
  p_created_by text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_return_id uuid;
  item jsonb;
  v_sale_item_id uuid;
  v_product_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_subtotal numeric;
  v_sold_qty numeric;
  v_returned_qty numeric;
  v_return_total numeric := 0;
  v_sale_total numeric;
  v_sale_credit numeric;
  v_sale_cash numeric;
  v_sale_upi numeric;
  v_refund_cash numeric := 0;
  v_refund_upi numeric := 0;
  v_refund_credit numeric := 0;
  v_sale_customer_id uuid;
  v_payment_type public.sale_payment_type;
BEGIN
  IF NOT public.user_belongs_to_business(p_business_id) THEN
    RAISE EXCEPTION 'User does not belong to business';
  END IF;

  SELECT
    total_amount,
    payment_type,
    COALESCE(credit_amount, 0),
    COALESCE(cash_amount, 0),
    COALESCE(upi_amount, 0),
    customer_id
  INTO v_sale_total, v_payment_type, v_sale_credit, v_sale_cash, v_sale_upi, v_sale_customer_id
  FROM public.sales
  WHERE id = p_sale_id AND business_id = p_business_id;

  IF v_sale_total IS NULL THEN
    RAISE EXCEPTION 'Sale not found for this business';
  END IF;

  IF v_sale_credit = 0 AND v_sale_cash = 0 AND v_sale_upi = 0 THEN
    IF v_payment_type = 'credit' THEN
      v_sale_credit := v_sale_total;
    ELSIF v_payment_type = 'upi' THEN
      v_sale_upi := v_sale_total;
    ELSE
      v_sale_cash := v_sale_total;
    END IF;
  END IF;

  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Select at least one item to return';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sale_item_id := (item->>'sale_item_id')::uuid;
    v_qty := (item->>'quantity')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Return quantity must be positive';
    END IF;

    SELECT si.product_id, si.quantity, si.returned_quantity, si.unit_price, si.subtotal
    INTO v_product_id, v_sold_qty, v_returned_qty, v_unit_price, v_subtotal
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE si.id = v_sale_item_id
      AND si.sale_id = p_sale_id
      AND s.business_id = p_business_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Sale item not found';
    END IF;

    IF v_returned_qty + v_qty > v_sold_qty THEN
      RAISE EXCEPTION 'Return quantity exceeds sold quantity';
    END IF;

    v_return_total := v_return_total + round((v_subtotal / v_sold_qty) * v_qty, 2);
  END LOOP;

  IF v_return_total <= 0 THEN
    RAISE EXCEPTION 'Return total must be positive';
  END IF;

  IF v_sale_total > 0 THEN
    v_refund_credit := round(v_return_total * (v_sale_credit / v_sale_total), 2);
    v_refund_cash := round(v_return_total * (v_sale_cash / v_sale_total), 2);
    v_refund_upi := round(v_return_total - v_refund_credit - v_refund_cash, 2);
  ELSE
    v_refund_cash := v_return_total;
  END IF;

  INSERT INTO public.sale_returns (
    business_id,
    sale_id,
    total_amount,
    refund_cash,
    refund_upi,
    refund_credit,
    created_by
  ) VALUES (
    p_business_id,
    p_sale_id,
    v_return_total,
    v_refund_cash,
    v_refund_upi,
    v_refund_credit,
    p_created_by
  ) RETURNING id INTO v_return_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sale_item_id := (item->>'sale_item_id')::uuid;
    v_qty := (item->>'quantity')::numeric;

    SELECT si.product_id, si.quantity, si.subtotal
    INTO v_product_id, v_sold_qty, v_subtotal
    FROM public.sale_items si
    WHERE si.id = v_sale_item_id AND si.sale_id = p_sale_id;

    v_unit_price := v_subtotal / v_sold_qty;

    UPDATE public.sale_items
    SET returned_quantity = returned_quantity + v_qty
    WHERE id = v_sale_item_id;

    INSERT INTO public.sale_return_items (
      return_id,
      sale_item_id,
      product_id,
      quantity,
      subtotal
    ) VALUES (
      v_return_id,
      v_sale_item_id,
      v_product_id,
      v_qty,
      round(v_unit_price * v_qty, 2)
    );

    INSERT INTO public.inventory_transactions (
      business_id,
      product_id,
      quantity_change,
      reason,
      source_type,
      source_id
    ) VALUES (
      p_business_id,
      v_product_id,
      v_qty,
      'Return #' || substr(v_return_id::text, 1, 8),
      'return',
      v_return_id
    );
  END LOOP;

  IF v_refund_credit > 0 THEN
    IF v_sale_customer_id IS NULL THEN
      RAISE EXCEPTION 'Cannot credit-adjust return without customer on original sale';
    END IF;

    INSERT INTO public.ledger_transactions (
      business_id,
      customer_id,
      amount,
      transaction_type,
      source_type,
      source_id
    ) VALUES (
      p_business_id,
      v_sale_customer_id,
      v_refund_credit,
      'credit',
      'return',
      v_return_id
    );
  END IF;

  IF v_refund_cash > 0 THEN
    INSERT INTO public.expenses (
      business_id,
      category,
      amount,
      payment_method,
      description
    ) VALUES (
      p_business_id,
      'Sale Return Refund',
      v_refund_cash,
      'cash',
      'Cash refund for return #' || substr(v_return_id::text, 1, 8)
    );
  END IF;

  RETURN v_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale_return(uuid, uuid, text, jsonb) TO anon, authenticated;
