import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

declare global {
  interface Window {
    google?: any;
  }
}

export function GoogleSheetsOAuth() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const queryClient = useQueryClient();

  // Load Google Identity Services
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleLoaded(true);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

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

  // Initiate OAuth flow with Google Identity Services
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!window.google || !googleLoaded) {
        throw new Error('Google Identity Services not loaded');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      setIsConnecting(true);

      // Get Google client ID from backend
      const { data: configData, error: configError } = await supabase.functions.invoke(
        'google-sheets-oauth/initiate',
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (configError) throw configError;

      const clientId = configData.clientId;

      // Use Google's token client for OAuth
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        callback: async (response: any) => {
          if (response.error) {
            throw new Error(response.error);
          }

          // Send token to backend to exchange and store
          const { error: storeError } = await supabase.functions.invoke(
            'google-sheets-oauth/store',
            {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: { accessToken: response.access_token },
            }
          );

          if (storeError) throw storeError;

          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['google-sheets-credentials'] });
          toast({
            title: "Connected!",
            description: "Google Sheets connected successfully",
          });
        },
      });

      client.requestAccessToken();
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
            disabled={isConnecting || !googleLoaded}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            {isConnecting ? "Connecting..." : "Connect Google Sheets"}
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
