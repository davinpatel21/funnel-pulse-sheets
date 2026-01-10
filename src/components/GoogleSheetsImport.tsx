import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Radio, Sparkles } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SheetTab } from "./GoogleSheetsFilePicker";

interface Mapping {
  sheetColumn: string;
  dbField: string | null;
  confidence: number | string;
  transformation?: string;
  notes?: string;
  sampleValue?: string;
  customFieldKey?: string;
}

interface AnalysisResult {
  sheetId: string;
  headers: string[];
  totalRows: number;
  sheet_type: string;
  analysis: {
    mappings: Mapping[];
    warnings: string[];
    suggestedDefaults: Record<string, string>;
  };
  sampleRows: any[];
  tabTitle?: string;
}

interface TabAnalysis {
  tab: SheetTab;
  analysis: AnalysisResult | null;
  mappings: Mapping[];
  error?: string;
}

interface GoogleSheetsImportProps {
  spreadsheetId?: string;
  spreadsheetName?: string;
  selectedTabs?: SheetTab[];
  // Legacy single-tab props
  sheetId?: number;
  sheetTitle?: string;
}

export function GoogleSheetsImport({ 
  spreadsheetId, 
  spreadsheetName, 
  selectedTabs,
  sheetId,
  sheetTitle 
}: GoogleSheetsImportProps = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Convert legacy single-tab to array format
  const tabs: SheetTab[] = selectedTabs || (sheetId !== undefined && sheetTitle ? [{ sheetId, title: sheetTitle, rowCount: 0 }] : []);
  
  const [tabAnalyses, setTabAnalyses] = useState<TabAnalysis[]>([]);
  const [currentAnalyzingIndex, setCurrentAnalyzingIndex] = useState<number>(-1);
  const [allAnalyzed, setAllAnalyzed] = useState(false);
  const [connectingAll, setConnectingAll] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [connectionComplete, setConnectionComplete] = useState(false);

  // Check authentication status
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      setUserId(session?.user?.id || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
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
  }, [tabs]);

  // Auto-start analysis when tabs are initialized
  useEffect(() => {
    if (tabAnalyses.length > 0 && currentAnalyzingIndex === -1 && !allAnalyzed && isLoggedIn) {
      analyzeNextTab(0);
    }
  }, [tabAnalyses, currentAnalyzingIndex, allAnalyzed, isLoggedIn]);

  const analyzeNextTab = async (index: number) => {
    if (index >= tabAnalyses.length) {
      setAllAnalyzed(true);
      setCurrentAnalyzingIndex(-1);
      return;
    }

    setCurrentAnalyzingIndex(index);
    const tab = tabAnalyses[index].tab;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${tab.sheetId}`;

    try {
      const { data, error } = await supabase.functions.invoke('google-sheets-import?action=analyze', {
        body: { sheetUrl },
      });

      if (error) throw error;

      setTabAnalyses(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          analysis: { ...data, tabTitle: tab.title },
          mappings: data.analysis.mappings,
        };
        return updated;
      });

      // Analyze next tab
      analyzeNextTab(index + 1);
    } catch (error: any) {
      setTabAnalyses(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          error: error.message,
        };
        return updated;
      });
      // Continue with next tab even if this one fails
      analyzeNextTab(index + 1);
    }
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

  // Show login required message if not authenticated
  if (!isLoggedIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import from Google Sheets
          </CardTitle>
          <CardDescription>
            Authentication required to import data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Please log in to use this feature</p>
            </div>
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
    const progress = tabAnalyses.length > 0 
      ? ((currentAnalyzingIndex + 1) / tabAnalyses.length) * 100 
      : 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Analyzing {spreadsheetName}
          </CardTitle>
          <CardDescription>
            AI is analyzing each tab to detect data types and map columns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Progress value={progress} className="h-2" />
          
          <div className="space-y-3">
            {tabAnalyses.map((ta, index) => (
              <div 
                key={ta.tab.sheetId}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  index === currentAnalyzingIndex 
                    ? 'border-primary bg-primary/5' 
                    : ta.analysis 
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' 
                      : ta.error 
                        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                        : 'border-muted'
                }`}
              >
                <div className="flex-shrink-0">
                  {index === currentAnalyzingIndex ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : ta.analysis ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : ta.error ? (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{ta.tab.title}</p>
                  {ta.analysis && (
                    <p className="text-sm text-muted-foreground">
                      Detected as {ta.analysis.sheet_type} • {ta.analysis.totalRows} rows
                    </p>
                  )}
                  {ta.error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{ta.error}</p>
                  )}
                </div>
              </div>
            ))}
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
        {successfulAnalyses.map((ta, tabIndex) => {
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
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet Column</TableHead>
                    <TableHead>Maps To</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Sample</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ta.mappings.slice(0, 5).map((mapping, mappingIndex) => (
                    <TableRow key={mappingIndex}>
                      <TableCell className="font-medium">{mapping.sheetColumn}</TableCell>
                      <TableCell>
                        <Select
                          value={mapping.dbField || "ignore"}
                          onValueChange={(value) => handleMappingChange(actualTabIndex, mappingIndex, value)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            <SelectItem value="ignore">❌ Ignore</SelectItem>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Common Fields</SelectLabel>
                              <SelectItem value="name">Name</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="phone">Phone</SelectItem>
                              <SelectItem value="status">Status</SelectItem>
                              <SelectItem value="notes">Notes</SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Team</SelectLabel>
                              <SelectItem value="full_name">Full Name</SelectItem>
                              <SelectItem value="role">Role</SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Appointments</SelectLabel>
                              <SelectItem value="scheduled_at">Scheduled At</SelectItem>
                              <SelectItem value="booked_at">Booked At</SelectItem>
                              <SelectItem value="appointment_status">Status</SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Deals</SelectLabel>
                              <SelectItem value="revenue_amount">Revenue</SelectItem>
                              <SelectItem value="cash_collected">Cash Collected</SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectItem value="custom_fields">Custom Field</SelectItem>
                          </SelectContent>
                        </Select>
                        {mapping.dbField === 'custom_fields' && (
                          <Input
                            placeholder="Field name"
                            value={mapping.customFieldKey || ''}
                            onChange={(e) => handleCustomFieldKeyChange(actualTabIndex, mappingIndex, e.target.value)}
                            className="mt-2 w-[180px]"
                          />
                        )}
                      </TableCell>
                      <TableCell>{getConfidenceBadge(mapping.confidence)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                        {mapping.sampleValue}
                      </TableCell>
                    </TableRow>
                  ))}
                  {ta.mappings.length > 5 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        +{ta.mappings.length - 5} more fields
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          );
        })}

        {/* Connect button */}
        <Button 
          onClick={handleConnectAll}
          disabled={connectingAll || successfulAnalyses.length === 0}
          className="w-full gap-2"
          size="lg"
        >
          {connectingAll ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Radio className="h-4 w-4" />
              Connect {successfulAnalyses.length} Tab{successfulAnalyses.length !== 1 ? 's' : ''} & Start Syncing
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
