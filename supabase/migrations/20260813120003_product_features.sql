-- Add unit_category to differentiate between quantity and measurement
ALTER TABLE public.products ADD COLUMN unit_category text NOT NULL DEFAULT 'quantity';
ALTER TABLE public.products ADD CONSTRAINT products_unit_category_known CHECK (unit_category IN ('quantity', 'measurement'));

-- Add low_stock_threshold to customize when alerts are shown for each product
ALTER TABLE public.products ADD COLUMN low_stock_threshold numeric(12, 3) NOT NULL DEFAULT 5.0;
ALTER TABLE public.products ADD CONSTRAINT products_low_stock_threshold_non_negative CHECK (low_stock_threshold >= 0);
