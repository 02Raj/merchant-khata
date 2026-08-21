-- RPC to handle receiving a payment from a customer
CREATE OR REPLACE FUNCTION public.receive_customer_payment(
  p_business_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_method text
) RETURNS uuid AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  -- Insert into payments
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

  -- Insert credit into ledger
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
