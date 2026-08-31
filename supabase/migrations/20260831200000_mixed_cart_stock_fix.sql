-- Fix stock validation when same product appears on multiple cart lines (mixed retail/wholesale)

DROP FUNCTION IF EXISTS public.process_checkout(
  uuid, uuid, text, public.sale_payment_type, numeric, numeric, jsonb, numeric, numeric, numeric, numeric
);

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
  v_moq numeric;
  v_is_wholesale boolean;
  v_cash numeric := 0;
  v_upi numeric := 0;
  v_credit numeric := 0;
  v_discount numeric := COALESCE(p_discount, 0);
  v_credit_limit numeric;
  v_current_balance numeric := 0;
  v_business_type public.business_type;
  v_required_qty numeric;
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

  SELECT b.business_type INTO v_business_type
  FROM public.businesses b
  WHERE b.id = p_business_id;

  -- Stock check: sum quantity per product across all lines
  FOR v_product_id, v_required_qty, v_product_name IN
    SELECT
      (item->>'product_id')::uuid,
      SUM((item->>'quantity')::numeric),
      MAX(p.name)
    FROM jsonb_array_elements(p_items) item
    JOIN public.products p ON p.id = (item->>'product_id')::uuid AND p.business_id = p_business_id
    GROUP BY (item->>'product_id')::uuid
  LOOP
    SELECT COALESCE(SUM(it.quantity_change), 0)
    INTO v_stock
    FROM public.inventory_transactions it
    WHERE it.product_id = v_product_id AND it.business_id = p_business_id;

    IF v_stock < v_required_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % (available %, requested %)', v_product_name, v_stock, v_required_qty;
    END IF;
  END LOOP;

  -- MOQ check per line
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (item->>'product_id')::uuid;
    v_qty := (item->>'quantity')::numeric;
    v_is_wholesale := COALESCE((item->>'is_wholesale_rate')::boolean, false);

    SELECT p.name, p.moq
    INTO v_product_name, v_moq
    FROM public.products p
    WHERE p.id = v_product_id AND p.business_id = p_business_id;

    IF v_product_name IS NULL THEN
      RAISE EXCEPTION 'Product not found for this business';
    END IF;

    IF v_is_wholesale AND v_moq IS NOT NULL AND v_qty < v_moq THEN
      RAISE EXCEPTION 'MOQ not met for % (minimum %, bill has %)', v_product_name, v_moq, v_qty;
    END IF;
  END LOOP;

  IF v_credit > 0 AND p_customer_id IS NOT NULL THEN
    SELECT c.credit_limit INTO v_credit_limit
    FROM public.customers c
    WHERE c.id = p_customer_id;

    IF v_credit_limit IS NOT NULL AND v_credit_limit > 0 THEN
      SELECT COALESCE(SUM(
        CASE
          WHEN lt.transaction_type = 'debit' THEN lt.amount
          ELSE -lt.amount
        END
      ), 0)
      INTO v_current_balance
      FROM public.ledger_transactions lt
      WHERE lt.business_id = p_business_id
        AND lt.customer_id = p_customer_id;

      IF v_current_balance + v_credit > v_credit_limit THEN
        RAISE EXCEPTION 'Credit limit exceeded (limit %, balance %, udhaar %)',
          v_credit_limit, v_current_balance, v_credit;
      END IF;
    END IF;
  END IF;

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
      tax_inclusive,
      is_wholesale_rate
    ) VALUES (
      v_sale_id,
      (item->>'product_id')::uuid,
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'subtotal')::numeric,
      (item->>'tax_rate')::numeric,
      (item->>'tax_amount')::numeric,
      (item->>'tax_inclusive')::boolean,
      COALESCE((item->>'is_wholesale_rate')::boolean, false)
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
