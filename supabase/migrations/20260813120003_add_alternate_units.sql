-- Add alternate unit and conversion factor to products
ALTER TABLE public.products ADD COLUMN alternate_unit text;
ALTER TABLE public.products ADD COLUMN conversion_factor numeric(12, 3);

-- Add constraint to ensure conversion factor is strictly positive if alternate unit is provided
ALTER TABLE public.products  ADD CONSTRAINT products_conversion_factor_positive CHECK (
    (alternate_unit IS NULL AND conversion_factor IS NULL) OR 
    (alternate_unit IS NOT NULL AND conversion_factor > 0)
  );

-- Update the Supabase schema cache
NOTIFY pgrst, 'reload schema';
