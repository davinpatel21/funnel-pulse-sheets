-- Fix 1: profiles_email_exposure - Restrict profile visibility to own profile + admins + related users
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can view all profiles  
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can view profiles of people they work with (same leads)
CREATE POLICY "Users view related profiles"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT setter_id FROM leads WHERE closer_id = auth.uid()
      UNION
      SELECT DISTINCT closer_id FROM leads WHERE setter_id = auth.uid()
    )
  );

-- Fix 2: leads_policy_always_true - Restrict leads INSERT to self-assignment or admins
DROP POLICY IF EXISTS "Users can create leads" ON public.leads;

-- Regular users can only create unassigned leads or assign to themselves
CREATE POLICY "Users can create leads with self assignment"
  ON public.leads FOR INSERT
  WITH CHECK (
    (setter_id IS NULL OR setter_id = auth.uid()) AND
    (closer_id IS NULL OR closer_id = auth.uid())
  );

-- Admins can create leads with any assignment
CREATE POLICY "Admins can create any leads"
  ON public.leads FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix 3: api_keys_plaintext - Migrate existing keys to hashes and clear plaintext
-- First, ensure all existing keys have hashes
UPDATE api_keys
SET api_key_hash = public.hash_api_key(api_key)
WHERE api_key_hash IS NULL AND api_key IS NOT NULL AND api_key != '[REDACTED]';

-- Clear plaintext keys
UPDATE api_keys SET api_key = '[REDACTED]' WHERE api_key != '[REDACTED]';