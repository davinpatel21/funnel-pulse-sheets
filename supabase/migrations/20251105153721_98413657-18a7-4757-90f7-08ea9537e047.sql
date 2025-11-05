-- Add sync_metadata column to profiles table for Google Sheets sync support
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sync_metadata jsonb DEFAULT '{}'::jsonb;