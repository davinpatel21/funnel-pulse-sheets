import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, Sparkles, LogIn, RefreshCw, Clock } from "lucide-react";
import { invokeWithAuth } from "@/lib/authHelpers";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { debugLog, debugError, createTimedOperation, formatErrorForDisplay } from "@/lib/debugLogger";
import { useNavigate } from "react-router-dom";

interface SheetTab {
  sheetId: number;
  title: string;
  rowCount: number;
}

interface Mapping {
  sheetColumn: string;
  dbField: string;
  confidence: number;
  customFieldKey?: string;
}

interface TabAnalysis {
  tab: SheetTab;
  analysis: any;
  mappings: Mapping[];
  error?: string;
  debugInfo?: { requestId?: string; rawError?: string };
}

interface GoogleSheetsImportProps {
  spreadsheetId: string;
  spreadsheetName: string;
  selectedTabs?: SheetTab[];
  sheetId?: number;
  sheetTitle?: string;
}

const DB_FIELD_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'source', label: 'Lead Source' },
  { value: 'status', label: 'Status' },
  { value: 'notes', label: 'Notes' },
  { value: 'utm_source', label: 'UTM Source' },
  { value: 'setter_id', label: 'Setter' },
  { value: 'closer_id', label: 'Closer' },
  { value: 'scheduled_at', label: 'Scheduled At' },
  { value: 'booked_at', label: 'Booked At' },
  { value: 'full_name', label: 'Full Name (Team)' },
  { value: 'role', label: 'Role (Team)' },
  // Form compliance fields
  { value: 'post_set_form_filled', label: 'Post Set Form (Checkbox)' },
  { value: 'closer_form_filled', label: 'Closer Form Filled (Checkbox)' },
  // Additional useful fields
  { value: 'call_status', label: 'Call Status/Result' },
  { value: 'recording_url', label: 'Recording URL' },
  { value: 'custom', label: '→ Custom Field' },
  { value: 'skip', label: '✕ Skip this column' },
];

export function GoogleSheetsImport({ 
  spreadsheetId, 
  spreadsheetName, 
  selectedTabs,
  sheetId,
  sheetTitle 
}: GoogleSheetsImportProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Convert legacy single-tab to array format
  const tabs: SheetTab[] = selectedTabs || (sheetId !== undefined && sheetTitle ? [{ sheetId, title: sheetTitle, rowCount: 0 }] : []);
  
  const [tabAnalyses, setTabAnalyses] = useState<TabAnalysis[]>([]);
  const [currentAnalyzingIndex, setCurrentAnalyzingIndex] = useState<number>(-1);
  const [allAnalyzed, setAllAnalyzed] = useState(false);
  const [connectingAll, setConnectingAll] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [connectionComplete, setConnectionComplete] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);
  const [showSlowWarning, setShowSlowWarning] = useState(false);

  // Check authentication status using getSession() to avoid triggering token refresh
  // NOTE: Using getSession() instead of getUser() to prevent race conditions
  // that can cause token revocation during auto-refresh
  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      // Use getSession() - it's synchronous and won't trigger auto-refresh
      const { data: { session }, error } = await supabase.auth.getSession();
      if (mounted) {
        if (error || !session?.user) {
          setIsLoggedIn(false);
          setUserId(null);
          setAuthError("Your session has expired. Please sign in again.");
        } else {
          setIsLoggedIn(true);
          setUserId(session.user.id);
          setAuthError(null);
        }
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        if (session?.user) {
          // Session exists - trust it without calling getUser()
          setIsLoggedIn(true);
          setUserId(session.user.id);
          setAuthError(null);
        } else {
          setIsLoggedIn(false);
          setUserId(null);
          setAuthError("Your session has expired. Please sign in again.");
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Initialize tab analyses when tabs change
  useEffect(() => {
    if (tabs.length > 0 && tabAnalyses.length === 0) {
      setTabAnalyses(tabs.map(tab => ({
        tab,
        analysis: null,
        mappings: [],
      })));
    }
  }, [tabs, tabAnalyses.length]);

  // Auto-start analysis when tabs are initialized and user is authenticated
  useEffect(() => {
    if (tabAnalyses.length > 0 && currentAnalyzingIndex === -1 && !allAnalyzed && isLoggedIn === true) {
      analyzeNextTab(0);
    }
  }, [tabAnalyses.length, currentAnalyzingIndex, allAnalyzed, isLoggedIn]);

  const analyzeNextTab = async (index: number, retryCount = 0) => {
    const maxRetries = 2;
    
    if (index >= tabAnalyses.length) {
      setAllAnalyzed(true);
      setCurrentAnalyzingIndex(-1);
      setAnalysisStartTime(null);
      setShowSlowWarning(false);
      return;
    }

    setCurrentAnalyzingIndex(index);
    if (index === 0) {
      setAnalysisStartTime(Date.now());
    }
    
    const tab = tabAnalyses[index].tab;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${tab.sheetId}`;

    const timer = createTimedOperation('GoogleSheetsImport', `analyze tab ${tab.title}`);
    debugLog('GoogleSheetsImport', `Analyzing tab ${index + 1}/${tabAnalyses.length} (attempt ${retryCount + 1})`, {
      tabTitle: tab.title,
      sheetId: tab.sheetId,
      gid: tab.sheetId,
      sheetUrl,
    });

    // Timeout handling - show slow warning after 10 seconds
    const slowTimeout = setTimeout(() => {
      setShowSlowWarning(true);
    }, 10000);

    try {
      const { data, error } = await invokeWithAuth('google-sheets-import?action=analyze', {
        body: { sheetUrl },
      });

      clearTimeout(slowTimeout);

      if (error) {
        const requestId = (error as any).requestId;
        const backendCode = (error as any).backendCode;
        
        debugError('GoogleSheetsImport', `Analysis failed for tab ${tab.title}`, error, {
          tabIndex: index,
          tabTitle: tab.title,
          requestId,
          retryCount,
        });

        // Check if it's an auth error - retry once after a delay
        if (backendCode === 'AUTH_REQUIRED' || error.message.includes('sign in')) {
          if (retryCount < maxRetries) {
            console.log(`[GoogleSheetsImport] Auth error on tab ${tab.title}, retrying in 1s... (attempt ${retryCount + 1})`);
            toast({
              title: "Refreshing authentication...",
              description: `Retrying analysis for "${tab.title}"`,
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
            return analyzeNextTab(index, retryCount + 1);
          }
          
          setAuthError("Your session has expired. Please sign in again to continue.");
          setTabAnalyses(prev => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              error: "Authentication required",
              debugInfo: { requestId, rawError: error.message },
            };
            return updated;
          });
          setAllAnalyzed(true);
          setCurrentAnalyzingIndex(-1);
          return;
        }

        throw error;
      }

      timer.success(`Analyzed as ${data.sheet_type}`, {
        headers: data.headers?.length,
        rowCount: data.totalRows,
        mappings: data.analysis?.mappings?.length,
      });

      setShowSlowWarning(false);
      setTabAnalyses(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          analysis: { ...data, tabTitle: tab.title },
          mappings: data.analysis.mappings,
          error: undefined,
        };
        return updated;
      });

      // Analyze next tab
      analyzeNextTab(index + 1);
    } catch (error: any) {
      clearTimeout(slowTimeout);
      const errorMessage = formatErrorForDisplay(error);
      const requestId = error.requestId;
      
      debugError('GoogleSheetsImport', `Tab analysis exception`, error, {
        tabIndex: index,
        tabTitle: tab.title,
        retryCount,
      });
      
      // Retry on network errors
      if (retryCount < maxRetries && (error.message?.includes('network') || error.message?.includes('fetch'))) {
        console.log(`[GoogleSheetsImport] Network error on tab ${tab.title}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return analyzeNextTab(index, retryCount + 1);
      }
      
      setTabAnalyses(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          error: errorMessage,
          debugInfo: { requestId, rawError: error.message },
        };
        return updated;
      });
      // Continue with next tab even if this one fails
      analyzeNextTab(index + 1);
    }
  };

  const retryFailedTab = async (tabIndex: number) => {
    setTabAnalyses(prev => {
      const updated = [...prev];
      updated[tabIndex] = {
        ...updated[tabIndex],
        error: undefined,
        debugInfo: undefined,
      };
      return updated;
    });
    await analyzeNextTab(tabIndex);
  };

  const handleMappingChange = (tabIndex: number, mappingIndex: number, newDbField: string) => {
    setTabAnalyses(prev => {
      const updated = [...prev];
      const mappings = [...updated[tabIndex].mappings];
      mappings[mappingIndex] = { ...mappings[mappingIndex], dbField: newDbField };
      updated[tabIndex] = { ...updated[tabIndex], mappings };
      return updated;
    });
  };

  const handleCustomFieldKeyChange = (tabIndex: number, mappingIndex: number, customFieldKey: string) => {
    setTabAnalyses(prev => {
      const updated = [...prev];
      const mappings = [...updated[tabIndex].mappings];
      mappings[mappingIndex] = { ...mappings[mappingIndex], customFieldKey };
      updated[tabIndex] = { ...updated[tabIndex], mappings };
      return updated;
    });
  };

  const handleConnectAll = async () => {
    if (!userId || !spreadsheetId) return;
    
    setConnectingAll(true);
    let successCount = 0;
    let errorCount = 0;

    for (const tabAnalysis of tabAnalyses) {
      if (!tabAnalysis.analysis || tabAnalysis.error) continue;

      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${tabAnalysis.tab.sheetId}`;
      
      try {
        const { error } = await supabase
          .from('sheet_configurations')
          .insert({
            user_id: userId,
            sheet_url: sheetUrl,
            sheet_name: tabAnalysis.tab.title,
            sheet_type: tabAnalysis.analysis.sheet_type,
            mappings: tabAnalysis.mappings as any,
            is_active: true,
          });

        if (error) throw error;
        successCount++;
      } catch (error: any) {
        console.error(`Failed to connect tab ${tabAnalysis.tab.title}:`, error);
        errorCount++;
      }
    }

    setConnectingAll(false);
    queryClient.invalidateQueries({ queryKey: ['sheet-configurations'] });

    if (successCount > 0) {
      setConnectionComplete(true);
      toast({
        title: "Workbook connected!",
        description: `${successCount} tab${successCount !== 1 ? 's' : ''} connected successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}. Data will sync automatically.`,
      });
    } else {
      toast({
        title: "Connection failed",
        description: "Could not connect any tabs. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSignIn = () => {
    navigate('/auth');
  };

  const retryAnalysis = () => {
    setAuthError(null);
    setAllAnalyzed(false);
    setCurrentAnalyzingIndex(-1);
    setTabAnalyses(tabs.map(tab => ({
      tab,
      analysis: null,
      mappings: [],
    })));
  };

  const getConfidenceBadge = (confidence: number | string) => {
    let numConfidence: number;
    
    if (typeof confidence === 'string') {
      numConfidence = confidence === 'high' ? 90 : 
                     confidence === 'medium' ? 60 : 30;
    } else {
      numConfidence = confidence;
    }
    
    if (numConfidence >= 80) {
      return <Badge className="bg-green-500">High</Badge>;
    } else if (numConfidence >= 50) {
      return <Badge className="bg-yellow-500">Medium</Badge>;
    } else {
      return <Badge variant="destructive">Low</Badge>;
    }
  };

  // Show loading while checking auth
  if (isLoggedIn === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking authentication...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  // Show auth error with sign-in button
  if (authError || isLoggedIn === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Authentication Required
          </CardTitle>
          <CardDescription>
            {authError || "Please sign in to import data from Google Sheets."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Session expired or invalid</p>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                Your authentication session is no longer valid. Please sign in again to continue.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSignIn} className="flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              Sign In
            </Button>
            {authError && (
              <Button variant="outline" onClick={retryAnalysis}>
                Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Connection complete
  if (connectionComplete) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Workbook Connected!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{spreadsheetName}</h3>
            <p className="text-muted-foreground">
              {tabAnalyses.filter(t => t.analysis && !t.error).length} tabs are now syncing with your dashboard.
              Data will refresh automatically every 5 minutes.
            </p>
          </div>
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full"
          >
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show analyzing progress
  if (!allAnalyzed) {
    const completedCount = tabAnalyses.filter(t => t.analysis || t.error).length;
    const progress = tabAnalyses.length > 0 
      ? (completedCount / tabAnalyses.length) * 100 
      : 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            Analyzing {spreadsheetName}
          </CardTitle>
          <CardDescription>
            AI is analyzing each tab to detect data types and map columns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Slow warning */}
          {showSlowWarning && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Taking longer than expected...</p>
                <p className="text-xs text-amber-800 dark:text-amber-200">This sometimes happens with large sheets. Please wait a moment.</p>
              </div>
            </div>
          )}
          
          {/* Overall progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {currentAnalyzingIndex >= 0 && currentAnalyzingIndex < tabAnalyses.length
                  ? `Analyzing "${tabAnalyses[currentAnalyzingIndex].tab.title}"...`
                  : 'Starting analysis...'
                }
              </span>
              <span className="font-medium">{completedCount}/{tabAnalyses.length} complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          {/* Tab list with visual indicators */}
          <div className="space-y-2">
            {tabAnalyses.map((ta, index) => {
              const isActive = index === currentAnalyzingIndex;
              const isComplete = !!ta.analysis;
              const isFailed = !!ta.error;
              const isPending = !isActive && !isComplete && !isFailed;
              
              return (
                <div 
                  key={ta.tab.sheetId}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ${
                    isActive 
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20' 
                      : isComplete 
                        ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20' 
                        : isFailed 
                          ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20'
                          : 'border-muted bg-muted/20'
                  }`}
                >
                  {/* Step indicator */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                    isActive 
                      ? 'bg-primary text-primary-foreground animate-pulse' 
                      : isComplete 
                        ? 'bg-green-500 text-white' 
                        : isFailed 
                          ? 'bg-red-500 text-white'
                          : 'bg-muted text-muted-foreground'
                  }`}>
                    {isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isComplete ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isFailed ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  
                  {/* Tab info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium truncate ${isActive ? 'text-primary' : ''}`}>
                        {ta.tab.title}
                      </p>
                      {isComplete && ta.analysis?.sheet_type && (
                        <Badge variant="secondary" className="text-xs">
                          {ta.analysis.sheet_type}
                        </Badge>
                      )}
                    </div>
                    {isActive && (
                      <p className="text-sm text-primary/80">Analyzing columns and data...</p>
                    )}
                    {isComplete && (
                      <p className="text-sm text-green-600 dark:text-green-400">
                        {ta.analysis.totalRows} rows • {ta.mappings?.length || 0} columns mapped
                      </p>
                    )}
                    {isFailed && (
                      <p className="text-sm text-red-600 dark:text-red-400 truncate">{ta.error}</p>
                    )}
                    {isPending && (
                      <p className="text-sm text-muted-foreground">Waiting...</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show all analyses for review
  const successfulAnalyses = tabAnalyses.filter(ta => ta.analysis && !ta.error);
  const failedAnalyses = tabAnalyses.filter(ta => ta.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Review Field Mappings
        </CardTitle>
        <CardDescription>
          Review and adjust the AI-detected mappings for {successfulAnalyses.length} tab{successfulAnalyses.length !== 1 ? 's' : ''}.
          {failedAnalyses.length > 0 && ` (${failedAnalyses.length} failed to analyze)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tabs summary */}
        <div className="flex flex-wrap gap-2">
          {successfulAnalyses.map((ta) => (
            <Badge key={ta.tab.sheetId} variant="secondary" className="capitalize">
              {ta.analysis?.sheet_type}: {ta.tab.title}
            </Badge>
          ))}
        </div>

        {/* Individual tab mappings */}
        {successfulAnalyses.map((ta) => {
          const actualTabIndex = tabAnalyses.findIndex(t => t.tab.sheetId === ta.tab.sheetId);
          
          return (
            <div key={ta.tab.sheetId} className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="font-medium">{ta.tab.title}</span>
                  <Badge variant="outline" className="capitalize">{ta.analysis?.sheet_type}</Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {ta.analysis?.totalRows} rows • {ta.mappings.length} fields
                </span>
              </div>
              <div className="p-4 space-y-3">
                {ta.mappings.map((mapping, mappingIndex) => (
                  <div key={mappingIndex} className="flex items-center gap-3">
                    <div className="w-1/3">
                      <span className="text-sm font-medium">{mapping.sheetColumn}</span>
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex-1 flex items-center gap-2">
                      <Select
                        value={mapping.dbField}
                        onValueChange={(value) => handleMappingChange(actualTabIndex, mappingIndex, value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DB_FIELD_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {mapping.dbField === 'custom' && (
                        <input
                          type="text"
                          placeholder="Field key"
                          value={mapping.customFieldKey || ''}
                          onChange={(e) => handleCustomFieldKeyChange(actualTabIndex, mappingIndex, e.target.value)}
                          className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                    {getConfidenceBadge(mapping.confidence)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Failed analyses warning with retry buttons */}
        {failedAnalyses.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                  {failedAnalyses.length} tab{failedAnalyses.length !== 1 ? 's' : ''} could not be analyzed
                </p>
                <div className="mt-2 space-y-2">
                  {failedAnalyses.map(ta => {
                    const actualTabIndex = tabAnalyses.findIndex(t => t.tab.sheetId === ta.tab.sheetId);
                    return (
                      <div key={ta.tab.sheetId} className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-yellow-900 dark:text-yellow-100">{ta.tab.title}</span>
                          <span className="text-yellow-800 dark:text-yellow-200">: {ta.error}</span>
                          {ta.debugInfo?.requestId && (
                            <span className="text-xs opacity-70 block"> (Request: {ta.debugInfo.requestId.slice(0, 8)})</span>
                          )}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => retryFailedTab(actualTabIndex)}
                          className="flex-shrink-0 gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Retry
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connect button */}
        {successfulAnalyses.length > 0 && (
          <Button 
            onClick={handleConnectAll} 
            disabled={connectingAll}
            className="w-full"
          >
            {connectingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Connect & Start Syncing
                <span className="ml-2 text-xs opacity-75">
                  ({successfulAnalyses.length} tab{successfulAnalyses.length !== 1 ? 's' : ''})
                </span>
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
