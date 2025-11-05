-- Drop the old constraint that doesn't include 'team'
ALTER TABLE sheet_configurations 
DROP CONSTRAINT IF EXISTS sheet_configurations_sheet_type_check;

-- Add new constraint with 'team' included in allowed values
ALTER TABLE sheet_configurations 
ADD CONSTRAINT sheet_configurations_sheet_type_check 
CHECK (sheet_type = ANY (ARRAY['leads'::text, 'appointments'::text, 'deals'::text, 'calls'::text, 'team'::text]));