-- Expenses table fixes (retail dashboard "Add Expense"):
-- 1) GRANT table privileges (fixes "permission denied for table expenses")
-- 2) Firebase-safe RLS via user_belongs_to_business (fixes auth.uid() mismatch)

REVOKE ALL ON TABLE public.expenses FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO anon, authenticated;

ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_select ON public.expenses;
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
DROP POLICY IF EXISTS expenses_update ON public.expenses;
DROP POLICY IF EXISTS expenses_delete ON public.expenses;

CREATE POLICY expenses_select ON public.expenses FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id))
  WITH CHECK (public.user_belongs_to_business(business_id));

CREATE POLICY expenses_delete ON public.expenses FOR DELETE TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));
