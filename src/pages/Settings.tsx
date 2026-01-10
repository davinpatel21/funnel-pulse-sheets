import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, FileSpreadsheet, CheckCircle2, Sparkles, ShieldCheck, ArrowLeft } from "lucide-react";
import { GoogleSheetsOAuth } from "@/components/GoogleSheetsOAuth";
import { GoogleSheetsFilePicker } from "@/components/GoogleSheetsFilePicker";
import { GoogleSheetsImport } from "@/components/GoogleSheetsImport";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { TeamInviteForm } from "@/components/TeamInviteForm";
import { invokeWithAuth } from "@/lib/authHelpers";
import { supabase } from "@/integrations/supabase/client";

type ImportMode = 'none' | 'picker' | 'analyze';

interface SelectedSheet {
  spreadsheetId: string;
  spreadsheetName: string;
  sheetId: number;
  sheetTitle: string;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { status, hasCredentials, hasSheetConfigs } = useSyncStatus();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const [importMode, setImportMode] = useState<ImportMode>('none');
  const [selectedSheet, setSelectedSheet] = useState<SelectedSheet | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Get user ID for sheet configuration
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
  }, []);

  // Handle OAuth success/error from redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get('oauth');
    
    if (oauthResult === 'success') {
      toast({
        title: "Connected!",
        description: "Google Sheets connected successfully. You can now select a spreadsheet to sync.",
      });
      queryClient.invalidateQueries({ queryKey: ['google-sheets-credentials'] });
      queryClient.invalidateQueries({ queryKey: ['google-sheets-list'] });
      // Clean up URL
      window.history.replaceState({}, '', '/settings');
    } else if (oauthResult === 'error') {
      const reason = params.get('reason') || 'Unknown error';
      toast({
        title: "Connection failed",
        description: `Could not connect Google Sheets: ${reason}`,
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/settings');
    }
  }, [toast, queryClient]);

  const syncNowMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeWithAuth('google-sheets-auto-sync');
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
      const { data, error } = await invokeWithAuth('google-sheets-create', {
        body: { sheetName: `Sales Tracker - ${new Date().toLocaleDateString()}` }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sheet-configurations'] });
      queryClient.invalidateQueries({ queryKey: ['google-sheets-list'] });
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

  const handleSheetSelect = (spreadsheetId: string, spreadsheetName: string, sheetId: number, sheetTitle: string) => {
    setSelectedSheet({ spreadsheetId, spreadsheetName, sheetId, sheetTitle });
    setImportMode('analyze');
  };

  const handleBackToPicker = () => {
    setSelectedSheet(null);
    setImportMode('picker');
  };

  const handleBackToOptions = () => {
    setSelectedSheet(null);
    setImportMode('none');
  };

  if (isAdminLoading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Non-admin view
  if (!isAdmin) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground text-lg">
              Team member access
            </p>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                <div className="bg-success/10 rounded-xl p-4 inline-block">
                  <ShieldCheck className="h-8 w-8 text-success" />
                </div>
              </div>
              <CardTitle>You're Connected</CardTitle>
              <CardDescription className="text-base">
                Your admin manages the Google Sheets connection. You have access to view the shared dashboard data.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              {hasSheetConfigs && (
                <div className="flex items-center justify-center gap-2 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Shared dashboard is active</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Admin view
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-lg">
            Manage your Google Sheets connection and team
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

        {/* Show file picker / import flow when connected but no sheets configured */}
        {hasCredentials && !hasSheetConfigs && (
          <>
            {importMode === 'none' && (
              <div className="space-y-4">
                {/* Create New Sheet Option */}
                <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 relative">
                      <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                      <div className="relative bg-card border rounded-xl p-4">
                        <Sparkles className="h-8 w-8 text-primary" />
                      </div>
                    </div>
                    <CardTitle className="text-2xl">Create New Tracker Sheet</CardTitle>
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

                {/* Select Existing Sheet Option */}
                <Card>
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-xl">Or Connect Existing Spreadsheet</CardTitle>
                    <CardDescription>
                      Have an existing spreadsheet? Select it and our AI will automatically map your columns.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center pt-4">
                    <Button 
                      onClick={() => setImportMode('picker')}
                      variant="outline"
                      size="lg"
                      className="gap-2"
                    >
                      <FileSpreadsheet className="h-5 w-5" />
                      Browse My Spreadsheets
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {importMode === 'picker' && (
              <div className="space-y-4">
                <Button 
                  variant="ghost" 
                  onClick={handleBackToOptions}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to options
                </Button>
                <GoogleSheetsFilePicker onSelect={handleSheetSelect} />
              </div>
            )}

            {importMode === 'analyze' && selectedSheet && (
              <div className="space-y-4">
                <Button 
                  variant="ghost" 
                  onClick={handleBackToPicker}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to file picker
                </Button>
                <GoogleSheetsImport 
                  spreadsheetId={selectedSheet.spreadsheetId}
                  spreadsheetName={selectedSheet.spreadsheetName}
                  sheetId={selectedSheet.sheetId}
                  sheetTitle={selectedSheet.sheetTitle}
                />
              </div>
            )}
          </>
        )}

        {/* Add another sheet button when already connected */}
        {hasCredentials && hasSheetConfigs && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Another Spreadsheet</CardTitle>
              <CardDescription>
                Connect additional spreadsheets to sync more data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setImportMode('picker')}
                variant="outline"
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Browse My Spreadsheets
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Team Invites Section - Admin only */}
        <TeamInviteForm />
      </div>
    </div>
  );
}
