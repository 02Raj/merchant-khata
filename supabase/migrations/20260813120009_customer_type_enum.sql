-- Add 'retail' and 'wholesale' to customer_type enum
ALTER TYPE public.customer_type ADD VALUE IF NOT EXISTS 'retail';
ALTER TYPE public.customer_type ADD VALUE IF NOT EXISTS 'wholesale';
