-- Platform admin: update any tenant's business_type (for QA / testing all modes).

CREATE OR REPLACE FUNCTION public.update_platform_business_type(
  p_business_id uuid,
  p_business_type text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type public.business_type;
  v_row public.businesses%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'business_id is required';
  END IF;

  BEGIN
    v_type := p_business_type::public.business_type;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid business_type. Use: retail, wholesale, both, restaurant';
  END;

  UPDATE public.businesses
  SET business_type = v_type
  WHERE id = p_business_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  RETURN json_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'business_type', v_row.business_type::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_business_type(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_platform_business_type(uuid, text) TO anon, authenticated;

COMMENT ON FUNCTION public.update_platform_business_type(uuid, text) IS
  'Platform admin only. Updates tenant business_type for testing retail/wholesale/both/restaurant modes.';
