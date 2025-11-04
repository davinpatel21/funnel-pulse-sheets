-- Create google_sheets_credentials table to store OAuth tokens
CREATE TABLE IF NOT EXISTS public.google_sheets_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS on google_sheets_credentials
ALTER TABLE public.google_sheets_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only access their own credentials
CREATE POLICY "Users can view their own credentials"
  ON public.google_sheets_credentials
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credentials"
  ON public.google_sheets_credentials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials"
  ON public.google_sheets_credentials
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials"
  ON public.google_sheets_credentials
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add sync_metadata JSONB column to existing tables
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sync_metadata JSONB DEFAULT '{}';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS sync_metadata JSONB DEFAULT '{}';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS sync_metadata JSONB DEFAULT '{}';
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS sync_metadata JSONB DEFAULT '{}';

-- Create sync_operations log table
CREATE TABLE IF NOT EXISTS public.sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sheet_config_id UUID REFERENCES public.sheet_configurations(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('pull', 'push', 'conflict_resolution')),
  records_affected INTEGER DEFAULT 0,
  errors JSONB,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

-- Enable RLS on sync_operations
ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;

-- Users can only view their own sync operations
CREATE POLICY "Users can view their own sync operations"
  ON public.sync_operations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sync_operations_user_id ON public.sync_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_operations_sheet_config_id ON public.sync_operations(sheet_config_id);

-- Add trigger to update updated_at on google_sheets_credentials
CREATE TRIGGER update_google_sheets_credentials_updated_at
  BEFORE UPDATE ON public.google_sheets_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();