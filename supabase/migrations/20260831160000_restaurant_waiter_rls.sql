-- Restrict waiters from billing/settling at the database layer.

CREATE OR REPLACE FUNCTION public.user_can_manage_billing(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_business_id IS NOT NULL
    AND (auth.jwt() ->> 'sub') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.business_users AS bu
      WHERE bu.business_id = p_business_id
        AND bu.user_id = (auth.jwt() ->> 'sub')
        AND bu.role IN ('owner', 'staff')
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_billing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_billing(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update ON public.orders
  FOR UPDATE
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (
    public.user_belongs_to_business(business_id)
    AND (
      public.user_can_manage_billing(business_id)
      OR (
        status = 'open'::public.order_status
        AND invoice_number IS NULL
      )
    )
  );

DROP POLICY IF EXISTS sales_insert ON public.sales;
CREATE POLICY sales_insert ON public.sales
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.user_can_manage_billing(business_id)
    AND created_by = (auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS cancel_requests_update ON public.cancel_requests;
CREATE POLICY cancel_requests_update ON public.cancel_requests
  FOR UPDATE
  USING (
    order_item_id IN (
      SELECT oi.id
      FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE public.user_can_manage_billing(o.business_id)
    )
  )
  WITH CHECK (
    order_item_id IN (
      SELECT oi.id
      FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE public.user_can_manage_billing(o.business_id)
    )
  );
