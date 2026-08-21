-- Add GST fields to products table
ALTER TABLE public.products ADD COLUMN hsn_code text;
ALTER TABLE public.products ADD COLUMN gst_rate numeric(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN tax_inclusive boolean NOT NULL DEFAULT true;

-- Add constraints to ensure valid GST slabs (for India: 0, 5, 12, 18, 28)
ALTER TABLE public.products ADD CONSTRAINT products_gst_rate_known CHECK (gst_rate IN (0, 5, 12, 18, 28));
