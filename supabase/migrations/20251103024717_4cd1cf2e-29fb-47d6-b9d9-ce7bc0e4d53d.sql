-- Create sheet_configurations table for storing AI-analyzed mappings
CREATE TABLE IF NOT EXISTS public.sheet_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sheet_url TEXT NOT NULL,
  sheet_type TEXT NOT NULL CHECK (sheet_type IN ('leads', 'appointments', 'deals', 'calls')),
  mappings JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sheet_configurations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sheet configurations"
  ON public.sheet_configurations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sheet configurations"
  ON public.sheet_configurations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sheet configurations"
  ON public.sheet_configurations
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sheet configurations"
  ON public.sheet_configurations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_sheet_configurations_updated_at
  BEFORE UPDATE ON public.sheet_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();