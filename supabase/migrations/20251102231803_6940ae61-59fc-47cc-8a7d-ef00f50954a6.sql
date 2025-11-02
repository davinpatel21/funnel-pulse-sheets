-- Add custom_fields column to leads table for flexible data storage
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- Add GIN index for better JSONB query performance
CREATE INDEX IF NOT EXISTS idx_leads_custom_fields ON leads USING gin (custom_fields);

-- Add comment for documentation
COMMENT ON COLUMN leads.custom_fields IS 'Flexible storage for additional lead data that does not fit standard fields. Stores key-value pairs as JSON.';