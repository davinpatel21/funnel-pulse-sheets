-- Add appointment-specific tracking fields
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS booked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS pipeline text,
  ADD COLUMN IF NOT EXISTS post_call_form_url text,
  ADD COLUMN IF NOT EXISTS closer_form_status text;

-- Add indexes for commonly filtered fields
CREATE INDEX IF NOT EXISTS idx_appointments_booked_at ON appointments(booked_at);
CREATE INDEX IF NOT EXISTS idx_appointments_pipeline ON appointments(pipeline);

-- Add comments for documentation
COMMENT ON COLUMN appointments.booked_at IS 'When the appointment was originally booked (Booking Time from sheet)';
COMMENT ON COLUMN appointments.recording_url IS 'URL to call recording';
COMMENT ON COLUMN appointments.pipeline IS 'Sales pipeline/closer name (e.g., Davin)';
COMMENT ON COLUMN appointments.post_call_form_url IS 'Link to post-call form submission';
COMMENT ON COLUMN appointments.closer_form_status IS 'Status of closer form completion';