-- Retail fixes: stock check at checkout, barcode uniqueness, supplier purchase + stock, payment RPC security

CREATE UNIQUE INDEX IF NOT EXISTS products_business_barcode_unique
  ON public.products (business_id, barcode)
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE OR REPLACE FUNCTION public.receive_customer_payment(
  p_business_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_method text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  IF NOT public.user_belongs_to_business(p_business_id) THEN
    RAISE EXCEPTION 'User does not belong to business';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this business';
  END IF;

  INSERT INTO public.payments (
    business_id,
    related_type,
    related_id,
    amount,
    direction,
    method
  ) VALUES (
    p_business_id,
    'customer',
    p_customer_id,
    p_amount,
    'received',
    p_method
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.ledger_transactions (
    business_id,
    customer_id,
    amount,
    transaction_type,
    source_type,
    source_id
  ) VALUES (
    p_business_id,
    p_customer_id,
    p_amount,
    'credit',
    'payment',
    v_payment_id
  );

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_supplier_purchase(
  p_business_id uuid,
  p_supplier_id uuid,
  p_created_by text,
  p_total_amount numeric,
  p_items jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_purchase_id uuid;
  item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_unit_cost numeric;
  v_subtotal numeric;
BEGIN
  IF NOT public.user_belongs_to_business(p_business_id) THEN
    RAISE EXCEPTION 'User does not belong to business';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase amount must be positive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Supplier does not belong to this business';
  END IF;

  INSERT INTO public.purchases (
    business_id,
    supplier_id,
    created_by,
    total_amount
  ) VALUES (
    p_business_id,
    p_supplier_id,
    p_created_by,
    p_total_amount
  ) RETURNING id INTO v_purchase_id;

  INSERT INTO public.ledger_transactions (
    business_id,
    supplier_id,
    amount,
    transaction_type,
    source_type,
    source_id
  ) VALUES (
    p_business_id,
    p_supplier_id,
    p_total_amount,
    'credit',
    'purchase',
    v_purchase_id
  );

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_product_id := (item->>'product_id')::uuid;
    v_qty := (item->>'quantity')::numeric;
    v_unit_cost := (item->>'unit_cost')::numeric;
    v_subtotal := (item->>'subtotal')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Purchase item quantity must be positive';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'Product does not belong to this business';
    END IF;

    INSERT INTO public.purchase_items (
      purchase_id,
      product_id,
      quantity,
      unit_cost,
      subtotal
    ) VALUES (
      v_purchase_id,
      v_product_id,
      v_qty,
      v_unit_cost,
      v_subtotal
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
      'Purchase #' || substr(v_purchase_id::text, 1, 8),
      'purchase',
      v_purchase_id
    );
  END LOOP;

  RETURN v_purchase_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_supplier_purchase(uuid, uuid, text, numeric, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_checkout(
  p_business_id uuid,
  p_customer_id uuid,
  p_created_by text,
  p_payment_type public.sale_payment_type,
  p_total_amount numeric,
  p_total_tax numeric,
  p_items jsonb
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
BEGIN
  IF NOT public.user_belongs_to_business(p_business_id) THEN
    RAISE EXCEPTION 'User does not belong to business';
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
    payment_type
  ) VALUES (
    p_business_id,
    p_customer_id,
    p_created_by,
    p_total_amount,
    p_total_tax,
    p_payment_type
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

  IF p_payment_type = 'credit' THEN
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
      p_total_amount,
      'debit',
      'sale',
      v_sale_id
    );
  END IF;

  RETURN v_sale_id;
END;
$$;
