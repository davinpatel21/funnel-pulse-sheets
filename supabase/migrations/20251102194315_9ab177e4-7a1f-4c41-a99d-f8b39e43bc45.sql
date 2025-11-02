-- Create enum types for better data consistency
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'qualified', 'unqualified');
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'completed', 'no_show', 'cancelled', 'rescheduled');
CREATE TYPE public.deal_status AS ENUM ('pending', 'won', 'lost');
CREATE TYPE public.user_role AS ENUM ('setter', 'closer', 'admin');
CREATE TYPE public.lead_source AS ENUM ('youtube', 'instagram', 'discord', 'email', 'vendor_doc', 'sms', 'facebook', 'tiktok', 'referral', 'other');

-- Profiles table for users (setters and closers)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'setter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leads table
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  source lead_source NOT NULL DEFAULT 'other',
  status lead_status NOT NULL DEFAULT 'new',
  setter_id UUID REFERENCES public.profiles(id),
  closer_id UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Appointments table
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  setter_id UUID REFERENCES public.profiles(id),
  closer_id UUID REFERENCES public.profiles(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Calls table
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id),
  caller_id UUID REFERENCES public.profiles(id),
  duration_minutes INTEGER,
  notes TEXT,
  was_live BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deals table
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id),
  closer_id UUID NOT NULL REFERENCES public.profiles(id),
  setter_id UUID REFERENCES public.profiles(id),
  status deal_status NOT NULL DEFAULT 'pending',
  revenue_amount DECIMAL(10, 2) NOT NULL,
  cash_collected DECIMAL(10, 2) DEFAULT 0,
  fees_amount DECIMAL(10, 2) DEFAULT 0,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for leads (all authenticated users can view)
CREATE POLICY "Authenticated users can view leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert leads"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update leads"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for appointments
CREATE POLICY "Authenticated users can view appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage appointments"
  ON public.appointments FOR ALL
  TO authenticated
  USING (true);

-- RLS Policies for calls
CREATE POLICY "Authenticated users can view calls"
  ON public.calls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert calls"
  ON public.calls FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for deals
CREATE POLICY "Authenticated users can view deals"
  ON public.deals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage deals"
  ON public.deals FOR ALL
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX idx_leads_setter ON public.leads(setter_id);
CREATE INDEX idx_leads_closer ON public.leads(closer_id);
CREATE INDEX idx_leads_source ON public.leads(source);
CREATE INDEX idx_appointments_setter ON public.appointments(setter_id);
CREATE INDEX idx_appointments_closer ON public.appointments(closer_id);
CREATE INDEX idx_appointments_scheduled ON public.appointments(scheduled_at);
CREATE INDEX idx_deals_closer ON public.deals(closer_id);
CREATE INDEX idx_deals_setter ON public.deals(setter_id);
CREATE INDEX idx_deals_status ON public.deals(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();