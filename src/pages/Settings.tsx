import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, FileSpreadsheet, CheckCircle2, Sparkles } from "lucide-react";
import { GoogleSheetsOAuth } from "@/components/GoogleSheetsOAuth";
import { useSyncStatus } from "@/hooks/useSyncStatus";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { status, hasCredentials, hasSheetConfigs } = useSyncStatus();

  const syncNowMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-sheets-auto-sync');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sheet-configurations'] });
      queryClient.invalidateQueries({ queryKey: ['live-sheet-data'] });
      toast({ 
        title: "Sync completed", 
        description: data?.message || "Data refreshed from Google Sheets"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createSheetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-sheets-create', {
        body: { sheetName: `Sales Tracker - ${new Date().toLocaleDateString()}` }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sheet-configurations'] });
      toast({ 
        title: "Sheet created successfully!", 
        description: `Created "${data.message}" - Opening in new tab...`
      });
      if (data.spreadsheetUrl) {
        window.open(data.spreadsheetUrl, '_blank');
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create sheet",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-lg">
            Connect your Google Sheets to get started
          </p>
        </div>

        {/* Status indicator when connected */}
        {hasCredentials && hasSheetConfigs && (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Connected & Syncing</span>
            </div>
            <Button 
              onClick={() => syncNowMutation.mutate()}
              disabled={syncNowMutation.isPending}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncNowMutation.isPending ? 'animate-spin' : ''}`} />
              {syncNowMutation.isPending ? 'Syncing...' : 'Refresh'}
            </Button>
          </div>
        )}

        {/* Google Sheets Connection */}
        <GoogleSheetsOAuth />

        {/* Create Sheet Card - Show when credentials exist but no sheets configured */}
        {hasCredentials && !hasSheetConfigs && (
          <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                <div className="relative bg-card border rounded-xl p-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl">Create Your Tracker Sheet</CardTitle>
              <CardDescription className="text-base">
                We'll create a new Google Sheet with all the tabs you need: Team, Leads, Appointments, Calls, and Deals.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pt-4">
              <Button 
                onClick={() => createSheetMutation.mutate()}
                disabled={createSheetMutation.isPending}
                size="lg"
                className="gap-2"
              >
                <FileSpreadsheet className="h-5 w-5" />
                {createSheetMutation.isPending ? 'Creating...' : 'Create New Tracker Sheet'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
