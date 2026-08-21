CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  description text,
  payment_method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_positive CHECK (amount > 0),
  CONSTRAINT expenses_category_not_blank CHECK (char_length(trim(category)) > 0)
);

CREATE INDEX idx_expenses_business_id ON public.expenses (business_id);
CREATE INDEX idx_expenses_created_at ON public.expenses (created_at);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;

CREATE POLICY expenses_select ON public.expenses
  FOR SELECT USING (
    business_id IN (
      SELECT bu.business_id
      FROM public.business_users bu
      WHERE bu.user_id = auth.uid()::text
    )
  );

CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT bu.business_id
      FROM public.business_users bu
      WHERE bu.user_id = auth.uid()::text
    )
  );

CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE USING (
    business_id IN (
      SELECT bu.business_id
      FROM public.business_users bu
      WHERE bu.user_id = auth.uid()::text
    )
  );

CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE USING (
    business_id IN (
      SELECT bu.business_id
      FROM public.business_users bu
      WHERE bu.user_id = auth.uid()::text
    )
  );
