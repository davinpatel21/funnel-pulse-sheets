-- Add missing fields to support all Google Sheet columns

-- Update leads table to capture UTM source
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS utm_source text;

-- Update deals table to capture payment platform
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS payment_platform text;

-- Add composite indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_appointments_status_closer ON appointments(status, closer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status_setter ON appointments(status, setter_id);
CREATE INDEX IF NOT EXISTS idx_deals_status_revenue ON deals(status, revenue_amount);
CREATE INDEX IF NOT EXISTS idx_deals_closer_id ON deals(closer_id);
CREATE INDEX IF NOT EXISTS idx_deals_setter_id ON deals(setter_id);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_setter_id ON leads(setter_id);