-- Fix PUBLIC_DATA_EXPOSURE: Restrict access to appointments, deals, and calls tables
-- Users should only see records they are assigned to, or admins can see all

-- ===========================================
-- APPOINTMENTS: Users see assigned appointments only
-- ===========================================
DROP POLICY IF EXISTS "Authenticated users can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can manage appointments" ON public.appointments;

CREATE POLICY "Users view assigned appointments"
  ON public.appointments FOR SELECT
  USING (
    auth.uid() = setter_id OR 
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users manage assigned appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (
    auth.uid() = setter_id OR 
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users update assigned appointments"
  ON public.appointments FOR UPDATE
  USING (
    auth.uid() = setter_id OR 
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users delete assigned appointments"
  ON public.appointments FOR DELETE
  USING (
    auth.uid() = setter_id OR 
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

-- ===========================================
-- DEALS: Users see their deals only
-- ===========================================
DROP POLICY IF EXISTS "Authenticated users can view deals" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can manage deals" ON public.deals;

CREATE POLICY "Users view their deals"
  ON public.deals FOR SELECT
  USING (
    auth.uid() = closer_id OR 
    auth.uid() = setter_id OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users insert deals"
  ON public.deals FOR INSERT
  WITH CHECK (
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users update their deals"
  ON public.deals FOR UPDATE
  USING (
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users delete their deals"
  ON public.deals FOR DELETE
  USING (
    auth.uid() = closer_id OR 
    public.has_role(auth.uid(), 'admin')
  );

-- ===========================================
-- CALLS: Users see calls for their leads
-- ===========================================
DROP POLICY IF EXISTS "Authenticated users can view calls" ON public.calls;
DROP POLICY IF EXISTS "Authenticated users can insert calls" ON public.calls;

CREATE POLICY "Users view related calls"
  ON public.calls FOR SELECT
  USING (
    auth.uid() = caller_id OR
    auth.uid() IN (SELECT setter_id FROM leads WHERE id = lead_id) OR
    auth.uid() IN (SELECT closer_id FROM leads WHERE id = lead_id) OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users create calls for assigned leads"
  ON public.calls FOR INSERT
  WITH CHECK (
    auth.uid() = caller_id OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users update their calls"
  ON public.calls FOR UPDATE
  USING (
    auth.uid() = caller_id OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users delete their calls"
  ON public.calls FOR DELETE
  USING (
    auth.uid() = caller_id OR
    public.has_role(auth.uid(), 'admin')
  );