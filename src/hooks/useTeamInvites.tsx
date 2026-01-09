import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database['public']['Enums']['app_role'];

interface TeamInvite {
  id: string;
  email: string;
  role: AppRole;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export function useTeamInvites() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['team-invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_invites')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TeamInvite[];
    },
  });

  const createInvite = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AppRole }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('team_invites')
        .insert({
          email: email.toLowerCase().trim(),
          role,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('An invite for this email already exists');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      toast({ title: "Invite sent", description: "Team member has been invited" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to send invite", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('team_invites')
        .delete()
        .eq('id', inviteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      toast({ title: "Invite revoked" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to revoke invite", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const pendingInvites = invites.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date());
  const acceptedInvites = invites.filter(i => i.accepted_at);

  return {
    invites,
    pendingInvites,
    acceptedInvites,
    isLoading,
    createInvite,
    revokeInvite,
  };
}
