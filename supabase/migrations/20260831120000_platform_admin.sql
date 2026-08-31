-- Platform owner / super-admin: cross-tenant read-only overview via SECURITY DEFINER RPCs.
-- Default owner email seeded below. Create matching Firebase Email/Password user in console.

CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  firebase_uid text UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admins_email_not_blank CHECK (char_length(trim(email)) > 0)
);

INSERT INTO public.platform_admins (email, display_name)
VALUES ('divyanshr243@gmail.com', 'Application Owner')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins AS pa
    WHERE (auth.jwt() ->> 'sub') IS NOT NULL
      AND (
        LOWER(pa.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
        OR pa.firebase_uid = (auth.jwt() ->> 'sub')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.check_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.sync_platform_admin_uid()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_uid text;
BEGIN
  v_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
  v_uid := auth.jwt() ->> 'sub';

  IF v_uid IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not a platform administrator';
  END IF;

  UPDATE public.platform_admins
  SET firebase_uid = v_uid
  WHERE LOWER(email) = v_email
    AND (firebase_uid IS NULL OR firebase_uid = v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_overview()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN public.is_platform_admin() THEN json_build_object(
      'total_businesses', (SELECT COUNT(*)::int FROM public.businesses),
      'total_users', (SELECT COUNT(*)::int FROM public.business_users),
      'owners', (SELECT COUNT(*)::int FROM public.business_users WHERE role = 'owner'),
      'staff', (SELECT COUNT(*)::int FROM public.business_users WHERE role IN ('staff', 'waiter')),
      'businesses_this_week', (
        SELECT COUNT(*)::int
        FROM public.businesses
        WHERE created_at >= (now() - interval '7 days')
      ),
      'users_this_week', (
        SELECT COUNT(*)::int
        FROM public.business_users
        WHERE created_at >= (now() - interval '7 days')
      )
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.list_platform_businesses()
RETURNS TABLE (
  id uuid,
  name text,
  owner_phone text,
  business_type text,
  address text,
  created_at timestamptz,
  user_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    b.id,
    b.name,
    b.owner_phone,
    b.business_type::text,
    b.address,
    b.created_at,
    COUNT(bu.id) AS user_count
  FROM public.businesses AS b
  LEFT JOIN public.business_users AS bu ON bu.business_id = b.id
  WHERE public.is_platform_admin()
  GROUP BY b.id, b.name, b.owner_phone, b.business_type, b.address, b.created_at
  ORDER BY b.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_platform_users()
RETURNS TABLE (
  id uuid,
  user_id text,
  role text,
  business_id uuid,
  business_name text,
  owner_phone text,
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    bu.id,
    bu.user_id,
    bu.role::text,
    b.id AS business_id,
    b.name AS business_name,
    b.owner_phone,
    bu.created_at AS joined_at
  FROM public.business_users AS bu
  JOIN public.businesses AS b ON b.id = bu.business_id
  WHERE public.is_platform_admin()
  ORDER BY bu.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_platform_admin_uid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_platform_businesses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_platform_users() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_platform_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_platform_admin_uid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_overview() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_businesses() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_users() TO anon, authenticated;

COMMENT ON TABLE public.platform_admins IS
  'Allowlisted platform owners. Login via Firebase Email/Password; RPCs gate cross-tenant reads.';
