import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSheetConfigurations } from "@/hooks/useSheetConfigurations";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Radio, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { LiveDataDebugger } from "./LiveDataDebugger";

export function ConnectedSheets() {
  const { data: configs, isLoading } = useSheetConfigurations();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-sheets-auto-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sheet-configurations'] });
      toast({ 
        title: "Sync completed", 
        description: data?.message || "Database updated with latest sheet data"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase
        .from('sheet_configurations')
        .delete()
        .eq('id', configId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet-configurations'] });
      toast({ title: "Sheet disconnected successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to disconnect sheet",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-success" />
              Connected Google Sheets
            </CardTitle>
            <CardDescription>
              Manage your live Google Sheets connections. Data syncs automatically every 5 minutes.
            </CardDescription>
          </div>
          <Button 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync All'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configs || configs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No sheets connected yet.</p>
            <p className="text-sm mt-2">Use the import tool above to connect a sheet.</p>
          </div>
        ) : (
          configs.map((config) => (
            <div
              key={config.id}
              className="border rounded-lg p-4 space-y-3 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <h4 className="font-semibold capitalize">{config.sheet_type} Sheet</h4>
                  </div>
                  <a
                    href={config.sheet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 group"
                  >
                    <span className="truncate max-w-[400px]">{config.sheet_url}</span>
                    <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                  {config.last_synced_at && (
                    <p className="text-xs text-muted-foreground">
                      Last synced: {formatDistanceToNow(new Date(config.last_synced_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => disconnectMutation.mutate(config.id)}
                  disabled={disconnectMutation.isPending}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                {(config.mappings as any[]).length} fields mapped
              </div>
              
              <LiveDataDebugger configId={config.id} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
