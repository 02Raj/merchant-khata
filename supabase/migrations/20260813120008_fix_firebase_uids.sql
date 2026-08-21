-- Fix the created_by column in sales and purchases to allow Firebase text UIDs instead of Supabase auth.users UUIDs.

-- 1. Drop policies that depend on the column type
DROP POLICY IF EXISTS sales_insert ON public.sales;
DROP POLICY IF EXISTS sales_update ON public.sales;
DROP POLICY IF EXISTS purchases_insert ON public.purchases;
DROP POLICY IF EXISTS purchases_update ON public.purchases;

-- 2. Drop constraints and alter column type
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_created_by_fkey;
ALTER TABLE public.sales ALTER COLUMN created_by TYPE text USING created_by::text;

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_created_by_fkey;
ALTER TABLE public.purchases ALTER COLUMN created_by TYPE text USING created_by::text;

-- 3. Re-create the policies
CREATE POLICY sales_insert ON public.sales
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY sales_update ON public.sales
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY purchases_insert ON public.purchases
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

CREATE POLICY purchases_update ON public.purchases
  FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );
