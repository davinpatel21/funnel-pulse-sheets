import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTeamInvites } from "@/hooks/useTeamInvites";
import { UserPlus, Mail, X, Clock, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database['public']['Enums']['app_role'];

export function TeamInviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("setter");
  const { pendingInvites, acceptedInvites, createInvite, revokeInvite, isLoading } = useTeamInvites();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    createInvite.mutate({ email, role }, {
      onSuccess: () => setEmail(""),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Team Invites
        </CardTitle>
        <CardDescription>
          Invite sales reps to access the shared dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Invite Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="rep@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="w-32 space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setter">Setter</SelectItem>
                  <SelectItem value="closer">Closer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={createInvite.isPending || !email.trim()}>
            {createInvite.isPending ? "Sending..." : "Send Invite"}
          </Button>
        </form>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Pending Invites
            </h4>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{invite.email}</span>
                    <Badge variant="outline" className="capitalize">
                      {invite.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Expires {formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revokeInvite.mutate(invite.id)}
                    disabled={revokeInvite.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted Invites */}
        {acceptedInvites.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Joined Team Members
            </h4>
            <div className="space-y-2">
              {acceptedInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-success/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{invite.email}</span>
                    <Badge variant="secondary" className="capitalize">
                      {invite.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Joined {formatDistanceToNow(new Date(invite.accepted_at!), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading invites...</div>
        )}
      </CardContent>
    </Card>
  );
}
