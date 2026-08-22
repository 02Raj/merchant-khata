ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.join_business_as_staff(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bus_id UUID;
BEGIN
  -- Validate user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to join a business';
  END IF;

  -- Find business by code
  SELECT id INTO v_bus_id FROM public.businesses WHERE invite_code = p_code;
  
  IF v_bus_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Invite Code';
  END IF;
  
  -- Insert into business_users
  INSERT INTO public.business_users (business_id, user_id, role)
  VALUES (v_bus_id, auth.uid()::text, 'waiter')
  ON CONFLICT DO NOTHING;
END;
$$;
