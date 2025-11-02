-- Create enum for import status
CREATE TYPE import_status AS ENUM ('pending', 'analyzing', 'ready', 'importing', 'completed', 'failed');

-- Create table for Google Sheets imports
CREATE TABLE public.google_sheets_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sheet_url text NOT NULL,
  sheet_id text NOT NULL,
  sheet_name text,
  last_sync_at timestamptz,
  field_mappings jsonb NOT NULL,
  sync_status import_status DEFAULT 'pending',
  rows_imported integer DEFAULT 0,
  rows_failed integer DEFAULT 0,
  errors jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.google_sheets_imports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own imports"
  ON public.google_sheets_imports
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own imports"
  ON public.google_sheets_imports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own imports"
  ON public.google_sheets_imports
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own imports"
  ON public.google_sheets_imports
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_google_sheets_imports_updated_at
  BEFORE UPDATE ON public.google_sheets_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();