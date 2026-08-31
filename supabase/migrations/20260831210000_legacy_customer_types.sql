-- Normalize legacy customer_type values to retail/wholesale

UPDATE public.customers
SET customer_type = 'retail'
WHERE customer_type::text = 'cash';

UPDATE public.customers
SET customer_type = 'wholesale'
WHERE customer_type::text = 'credit';

GRANT EXECUTE ON FUNCTION public.receive_customer_payment(uuid, uuid, numeric, text) TO anon, authenticated;
