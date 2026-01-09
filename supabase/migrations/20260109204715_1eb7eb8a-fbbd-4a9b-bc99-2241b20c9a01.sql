-- Fix security linter warnings from previous migration

-- 1. Drop the SECURITY DEFINER view and recreate as regular view
DROP VIEW IF EXISTS public.google_sheets_credentials_status;

-- Recreate as a simple view (no SECURITY DEFINER)
CREATE VIEW public.google_sheets_credentials_status AS
SELECT 
  id,
  user_id,
  expires_at,
  created_at,
  updated_at,
  CASE WHEN expires_at > NOW() THEN true ELSE false END as is_valid
FROM public.google_sheets_credentials
WHERE user_id = auth.uid();

-- 2. Fix function search path issues
CREATE OR REPLACE FUNCTION public.hash_api_key(key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(sha256(key::bytea), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.verify_api_key(plain_key text, stored_hash text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.hash_api_key(plain_key) = stored_hash;
$$;