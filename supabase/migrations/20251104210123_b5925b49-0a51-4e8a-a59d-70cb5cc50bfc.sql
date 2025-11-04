-- Allow edge functions (service role) to manage profiles for team roster imports
CREATE POLICY "Service role can manage profiles"
ON profiles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);