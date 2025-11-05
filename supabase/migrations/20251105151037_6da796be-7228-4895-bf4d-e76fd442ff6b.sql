-- Add sheet_name column to track which tab within a workbook
ALTER TABLE sheet_configurations
ADD COLUMN IF NOT EXISTS sheet_name text;

-- Add comment
COMMENT ON COLUMN sheet_configurations.sheet_name IS 'Specific sheet/tab name within the Google Sheets workbook';