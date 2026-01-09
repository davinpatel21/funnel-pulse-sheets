-- Create team_invites table
CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'setter',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  CONSTRAINT unique_pending_invite UNIQUE (email)
);

-- Enable RLS
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Admins can manage all invites
CREATE POLICY "Admins can manage invites"
  ON public.team_invites
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can view invites for their own email
CREATE POLICY "Users can view own invites"
  ON public.team_invites
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.email()));

-- Create function to handle invite acceptance on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record team_invites%ROWTYPE;
BEGIN
  -- Check if there's a pending invite for this email
  SELECT * INTO invite_record
  FROM public.team_invites
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF FOUND THEN
    -- Assign the role from the invite (in addition to default role)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, invite_record.role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Mark invite as accepted
    UPDATE public.team_invites
    SET accepted_at = now()
    WHERE id = invite_record.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users for new signups
CREATE TRIGGER on_auth_user_created_check_invite
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_invite();