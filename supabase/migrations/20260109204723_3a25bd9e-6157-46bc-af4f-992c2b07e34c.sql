-- Fix SECURITY DEFINER view warning by dropping the view
-- The RLS on the underlying table will handle access control instead
DROP VIEW IF EXISTS public.google_sheets_credentials_status;

-- The RLS policy on google_sheets_credentials already restricts access
-- Client code should use the table directly (which only shows non-token columns through our query pattern)