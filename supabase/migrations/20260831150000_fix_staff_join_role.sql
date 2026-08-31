-- Assign staff vs waiter role based on business type when joining via invite code
CREATE OR REPLACE FUNCTION public.join_business_as_staff(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bus_id UUID;
  v_business_type public.business_type;
  v_role public.business_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to join a business';
  END IF;

  SELECT id, business_type INTO v_bus_id, v_business_type
  FROM public.businesses
  WHERE invite_code = p_code;

  IF v_bus_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Invite Code';
  END IF;

  v_role := CASE
    WHEN v_business_type = 'restaurant' THEN 'waiter'::public.business_role
    ELSE 'staff'::public.business_role
  END;

  INSERT INTO public.business_users (business_id, user_id, role)
  VALUES (v_bus_id, auth.uid()::text, v_role)
  ON CONFLICT (business_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
