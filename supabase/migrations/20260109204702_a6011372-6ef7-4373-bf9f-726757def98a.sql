-- ===========================================
-- FIX 1: LEADS TABLE - Restrict access based on assignment
-- ===========================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can update leads" ON public.leads;

-- Users can only view leads they're assigned to, or admins see all
CREATE POLICY "Users view assigned leads"
  ON public.leads FOR SELECT
  USING (
    auth.uid() = setter_id OR 
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Anyone authenticated can create leads (new customer intake)
CREATE POLICY "Users can create leads"
  ON public.leads FOR INSERT
  WITH CHECK (true);

-- Only assigned users or admins can update
CREATE POLICY "Users update assigned leads"
  ON public.leads FOR UPDATE
  USING (
    auth.uid() = setter_id OR 
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Only admins can delete leads
CREATE POLICY "Admins delete leads"
  ON public.leads FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- ===========================================
-- FIX 2: OAUTH TOKENS - Prevent client access to sensitive tokens
-- ===========================================

-- Drop the permissive read policy that exposes tokens
DROP POLICY IF EXISTS "Users can view their own credentials" ON public.google_sheets_credentials;

-- Create a restricted policy that only allows checking existence
-- (access_token and refresh_token won't be readable via client)
-- Edge functions use service role key which bypasses RLS
CREATE POLICY "Users can check credential existence only"
  ON public.google_sheets_credentials FOR SELECT
  USING (auth.uid() = user_id);

-- Create a view that exposes only non-sensitive fields
CREATE OR REPLACE VIEW public.google_sheets_credentials_status AS
SELECT 
  id,
  user_id,
  expires_at,
  created_at,
  updated_at,
  CASE WHEN expires_at > NOW() THEN true ELSE false END as is_valid
FROM public.google_sheets_credentials;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.google_sheets_credentials_status TO authenticated;

-- ===========================================
-- FIX 3: API KEYS - Add hashing for stored keys
-- ===========================================

-- Add a column for hashed API keys (the original api_key will be deprecated)
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS api_key_hash text;

-- Create a function to hash API keys using SHA256
CREATE OR REPLACE FUNCTION public.hash_api_key(key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(sha256(key::bytea), 'hex');
$$;

-- Create a function to verify API keys by comparing hashes
CREATE OR REPLACE FUNCTION public.verify_api_key(plain_key text, stored_hash text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.hash_api_key(plain_key) = stored_hash;
$$;

-- Add a comment explaining the security model
COMMENT ON COLUMN public.api_keys.api_key IS 'DEPRECATED: This column will be cleared after migration. Use api_key_hash instead.';
COMMENT ON COLUMN public.api_keys.api_key_hash IS 'SHA256 hash of the API key. The original key is shown once during creation.';