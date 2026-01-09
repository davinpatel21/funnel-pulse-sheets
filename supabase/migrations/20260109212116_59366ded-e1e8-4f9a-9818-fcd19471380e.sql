-- Drop existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view their own sheet configurations" 
  ON public.sheet_configurations;

-- Create new policy allowing all authenticated users to view sheet configurations
CREATE POLICY "All authenticated users can view sheet configurations"
  ON public.sheet_configurations
  FOR SELECT
  TO authenticated
  USING (true);