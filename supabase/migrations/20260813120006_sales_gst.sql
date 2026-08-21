-- Add GST tracking columns to sales and sale_items
ALTER TABLE public.sales ADD COLUMN total_tax numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items ADD COLUMN tax_rate numeric(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN tax_amount numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN tax_inclusive boolean NOT NULL DEFAULT true;

-- Ensure tax constraints
ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_tax_rate_known CHECK (tax_rate IN (0, 5, 12, 18, 28));
