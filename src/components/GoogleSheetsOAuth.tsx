import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function GoogleSheetsOAuth() {
  const [isConnecting, setIsConnecting] = useState(false);
  const queryClient = useQueryClient();

  // Check if user has connected Google Sheets
  const { data: credentials, isLoading } = useQuery({
    queryKey: ['google-sheets-credentials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_sheets_credentials')
        .select('*')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  // Initiate OAuth flow
  const connectMutation = useMutation({
    mutationFn: async () => {
      setIsConnecting(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('google-sheets-oauth/initiate', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { redirectOrigin: window.location.origin },
      });

      if (error) throw error;
      
      const authUrl = data.authUrl as string;
      
      // Check if we're in an iframe
      const inIframe = window.self !== window.top;
      
      if (inIframe) {
        // Break out of iframe to avoid "Refused to connect"
        try {
          window.top!.location.assign(authUrl);
        } catch {
          window.location.assign(authUrl);
        }
        return;
      }
      
      // Not in iframe - try opening in new tab
      const newWindow = window.open(authUrl, '_blank', 'noopener,noreferrer');
      
      if (!newWindow) {
        // Popup blocked - use top-level navigation
        toast({
          title: "Pop-up blocked",
          description: "Redirecting you now. Please allow pop-ups for this site.",
        });
        try {
          if (window.top) {
            window.top.location.assign(authUrl);
          } else {
            window.location.assign(authUrl);
          }
        } catch {
          window.location.assign(authUrl);
        }
      } else {
        setIsConnecting(false);
      }
    },
    onError: (error: Error) => {
      setIsConnecting(false);
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Disconnect (delete credentials)
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('google_sheets_credentials')
        .delete()
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-sheets-credentials'] });
      toast({
        title: "Disconnected",
        description: "Google Sheets connection removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Disconnection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isConnected = !!credentials;
  const isExpired = credentials && new Date(credentials.expires_at) < new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Google Sheets Connection
          {isConnected && !isExpired && (
            <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          )}
          {isConnected && isExpired && (
            <Badge variant="outline" className="gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
              <RefreshCw className="h-3 w-3" />
              Expired
            </Badge>
          )}
          {!isConnected && (
            <Badge variant="outline" className="gap-1 bg-gray-50 text-gray-700 border-gray-200">
              <XCircle className="h-3 w-3" />
              Not Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {isConnected 
            ? "Your Google account is connected and syncing automatically"
            : "Connect your Google account to enable automatic Google Sheets sync"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected && (
          <Button
            onClick={() => connectMutation.mutate()}
            disabled={isConnecting}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Connect Google Sheets
          </Button>
        )}

        {isConnected && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date(credentials.updated_at).toLocaleString()}
            </p>
            <div className="flex gap-2">
              {isExpired && (
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={isConnecting}
                  variant="outline"
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reconnect
                </Button>
              )}
              <Button
                onClick={() => disconnectMutation.mutate()}
                variant="destructive"
                disabled={disconnectMutation.isPending}
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading connection status...</p>
        )}
      </CardContent>
    </Card>
  );
}
