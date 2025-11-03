import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LiveDataDebugger({ configId }: { configId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['debug-live-data', configId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-sheets-live', {
        body: { configuration_id: configId }
      });
      
      return { data, error };
    },
    enabled: !!configId,
  });

  return (
    <Card className="p-4 bg-muted/50 border-warning">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-warning" />
          <h3 className="font-semibold">Live Data Debug</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Test Connection
        </Button>
      </div>
      
      {isLoading && <p className="text-sm text-muted-foreground">Testing connection...</p>}
      
      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <div>
            <p className="font-medium">Connection Failed</p>
            <p className="text-xs mt-1">{error.message}</p>
          </div>
        </div>
      )}
      
      {data && !data.error && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span>Connected successfully</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{data.data?.row_count || 0} rows</Badge>
            <Badge variant="secondary">{data.data?.sheet_type}</Badge>
          </div>
          {data.data?.data?.[0] && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View sample record
              </summary>
              <pre className="mt-2 p-2 bg-background rounded border overflow-auto max-h-[200px]">
                {JSON.stringify(data.data.data[0], null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
      
      {data?.error && (
        <div className="text-sm text-destructive">
          <p className="font-medium">Edge Function Error:</p>
          <p className="text-xs mt-1">{data.error}</p>
        </div>
      )}
    </Card>
  );
}
