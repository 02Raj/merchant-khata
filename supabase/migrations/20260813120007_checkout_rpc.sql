-- Drop any existing overloaded versions of the function to prevent PostgREST conflicts
DROP FUNCTION IF EXISTS public.process_checkout(uuid, uuid, uuid, public.sale_payment_type, numeric, numeric, jsonb);
DROP FUNCTION IF EXISTS public.process_checkout(uuid, uuid, text, public.sale_payment_type, numeric, numeric, jsonb);

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
AS $$
DECLARE
  v_sale_id uuid;
  item jsonb;
BEGIN
  -- 1. Validate permissions
  IF NOT public.user_belongs_to_business(p_business_id) THEN
    RAISE EXCEPTION 'User does not belong to business';
  END IF;

  IF p_payment_type = 'credit' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer must be selected for credit sales';
  END IF;

  -- Validate customer belongs to business
  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers 
      WHERE id = p_customer_id AND business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'Customer does not belong to this business';
    END IF;
  END IF;

  -- 2. Create the Sale record
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

  -- 3. Process items
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- A. Insert Sale Item
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

    -- B. Deduct Inventory (Negative quantity_change)
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

  -- 4. Handle Credit / Udhaar
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
