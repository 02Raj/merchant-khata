-- Staff PIN auth (no Firebase/SMS per staff). Owner Firebase session stays the RLS identity.

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role public.business_role NOT NULL DEFAULT 'staff',
  pin_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profiles_name_not_blank CHECK (char_length(trim(display_name)) > 0),
  CONSTRAINT staff_profiles_role_check CHECK (role IN ('staff', 'waiter'))
);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_business_id ON public.staff_profiles (business_id);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_profiles_select ON public.staff_profiles;
CREATE POLICY staff_profiles_select ON public.staff_profiles FOR SELECT TO anon, authenticated
  USING (public.user_is_business_owner(business_id));

DROP POLICY IF EXISTS staff_profiles_insert ON public.staff_profiles;
CREATE POLICY staff_profiles_insert ON public.staff_profiles FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_is_business_owner(business_id));

DROP POLICY IF EXISTS staff_profiles_update ON public.staff_profiles;
CREATE POLICY staff_profiles_update ON public.staff_profiles FOR UPDATE TO anon, authenticated
  USING (public.user_is_business_owner(business_id));

DROP POLICY IF EXISTS staff_profiles_delete ON public.staff_profiles;
CREATE POLICY staff_profiles_delete ON public.staff_profiles FOR DELETE TO anon, authenticated
  USING (public.user_is_business_owner(business_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_staff_pin(
  p_business_id uuid,
  p_pin text
)
RETURNS TABLE (
  staff_id uuid,
  display_name text,
  role public.business_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (auth.jwt() ->> 'sub') IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.user_belongs_to_business(p_business_id) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;

  RETURN QUERY
  SELECT sp.id, sp.display_name, sp.role
  FROM public.staff_profiles sp
  WHERE sp.business_id = p_business_id
    AND sp.is_active = true
    AND sp.pin_hash = crypt(p_pin, sp.pin_hash)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_staff_profile(
  p_business_id uuid,
  p_display_name text,
  p_role public.business_role,
  p_pin text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.user_is_business_owner(p_business_id) THEN
    RAISE EXCEPTION 'Only owner can create staff';
  END IF;

  IF length(p_pin) < 4 OR length(p_pin) > 6 OR p_pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'PIN must be 4-6 digits';
  END IF;

  IF p_pin IN (
    '0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
    '1234','0123','12345','123456','654321','1122','1212','1000','0001'
  ) THEN
    RAISE EXCEPTION 'Choose a less obvious PIN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.business_id = p_business_id
      AND sp.is_active = true
      AND sp.pin_hash = crypt(p_pin, sp.pin_hash)
  ) THEN
    RAISE EXCEPTION 'PIN already in use';
  END IF;

  INSERT INTO public.staff_profiles (business_id, display_name, role, pin_hash)
  VALUES (p_business_id, trim(p_display_name), p_role, crypt(p_pin, gen_salt('bf')))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_staff_profile(uuid, text, public.business_role, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_staff_pin(
  p_staff_id uuid,
  p_pin text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.staff_profiles WHERE id = p_staff_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Staff not found';
  END IF;
  IF NOT public.user_is_business_owner(v_business_id) THEN
    RAISE EXCEPTION 'Only owner can update PIN';
  END IF;
  IF length(p_pin) < 4 OR length(p_pin) > 6 OR p_pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'PIN must be 4-6 digits';
  END IF;
  IF p_pin IN (
    '0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
    '1234','0123','12345','123456','654321','1122','1212','1000','0001'
  ) THEN
    RAISE EXCEPTION 'Choose a less obvious PIN';
  END IF;

  UPDATE public.staff_profiles
  SET pin_hash = crypt(p_pin, gen_salt('bf')), updated_at = now()
  WHERE id = p_staff_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_pin(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_staff_profile_active(
  p_staff_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.staff_profiles WHERE id = p_staff_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Staff not found';
  END IF;
  IF NOT public.user_is_business_owner(v_business_id) THEN
    RAISE EXCEPTION 'Only owner can update staff';
  END IF;

  UPDATE public.staff_profiles
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_staff_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_staff_profile_active(uuid, boolean) TO anon, authenticated;
