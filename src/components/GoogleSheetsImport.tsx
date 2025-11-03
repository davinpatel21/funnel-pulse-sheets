import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Radio } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

interface Mapping {
  sheetColumn: string;
  dbField: string | null;
  confidence: number;
  transformation?: string;
  notes?: string;
  sampleValue?: string;
  customFieldKey?: string;
}

interface AnalysisResult {
  sheetId: string;
  headers: string[];
  totalRows: number;
  analysis: {
    mappings: Mapping[];
    warnings: string[];
    suggestedDefaults: Record<string, string>;
  };
  sampleRows: any[];
}

export function GoogleSheetsImport() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { toast } = useToast();

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

  const analyzeMutation = useMutation({
    mutationFn: async (url: string) => {
      const { data, error } = await supabase.functions.invoke('google-sheets-import?action=analyze', {
        body: { sheetUrl: url },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data: AnalysisResult) => {
      setAnalysisResult(data);
      setMappings(data.analysis.mappings);
      toast({ title: "Sheet analyzed successfully!" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to analyze sheet",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!analysisResult) throw new Error("No analysis result");

      const { data, error } = await supabase.functions.invoke('google-sheets-import?action=import', {
        body: {
          sheetUrl: sheetUrl,
          mappings: mappings,
          defaults: analysisResult.analysis.suggestedDefaults,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      toast({
        title: "Import completed!",
        description: `${data.imported} leads imported successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectLiveMutation = useMutation({
    mutationFn: async () => {
      if (!analysisResult) throw new Error("No analysis result");
      if (!userId) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from('sheet_configurations')
        .insert({
          user_id: userId,
          sheet_url: sheetUrl,
          sheet_type: 'leads',
          mappings: mappings as any,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Sheet connected!",
        description: "Your sheet is now connected and will sync automatically every 5 minutes",
      });
      reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to connect sheet",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = () => {
    if (!sheetUrl) {
      toast({ title: "Please enter a Google Sheets URL", variant: "destructive" });
      return;
    }
    analyzeMutation.mutate(sheetUrl);
  };

  const handleImport = () => {
    importMutation.mutate();
  };

  const handleConnectLive = () => {
    connectLiveMutation.mutate();
  };

  const handleMappingChange = (index: number, newDbField: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], dbField: newDbField };
    setMappings(newMappings);
  };

  const handleCustomFieldKeyChange = (index: number, customFieldKey: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], customFieldKey };
    setMappings(newMappings);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) {
      return <Badge className="bg-green-500">High ({confidence}%)</Badge>;
    } else if (confidence >= 50) {
      return <Badge className="bg-yellow-500">Medium ({confidence}%)</Badge>;
    } else {
      return <Badge variant="destructive">Low ({confidence}%)</Badge>;
    }
  };

  const reset = () => {
    setSheetUrl("");
    setAnalysisResult(null);
    setMappings([]);
    setImportResult(null);
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
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-900">Please log in to use this feature</p>
              <p className="text-sm text-yellow-700 mt-1">
                You need to be authenticated to import leads from Google Sheets. This feature requires a user account to track imports and associate leads with your profile.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (importResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Import Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Successfully imported:</span>
              <span className="font-bold text-green-600">{importResult.imported} leads</span>
            </div>
            {importResult.failed > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Failed:</span>
                <span className="font-bold text-red-600">{importResult.failed} rows</span>
              </div>
            )}
          </div>

          {importResult.errors && importResult.errors.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Errors:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {importResult.errors.slice(0, 5).map((err: any, i: number) => (
                  <div key={i} className="text-sm text-red-600 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Row {err.row}: {err.error}</span>
                  </div>
                ))}
                {importResult.errors.length > 5 && (
                  <p className="text-sm text-muted-foreground">
                    ...and {importResult.errors.length - 5} more errors
                  </p>
                )}
              </div>
            </div>
          )}

          <Button onClick={reset} className="w-full">
            Import Another Sheet
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (analysisResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Field Mappings</CardTitle>
          <CardDescription>
            AI has suggested these mappings. Review and adjust before importing {analysisResult.totalRows} rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysisResult.analysis.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 space-y-1">
              {analysisResult.analysis.warnings.map((warning, i) => (
                <div key={i} className="text-sm text-yellow-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Google Sheets Column</TableHead>
                  <TableHead>Maps To</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Sample Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((mapping, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{mapping.sheetColumn}</TableCell>
                    <TableCell>
                      <Select
                        value={mapping.dbField || "ignore"}
                        onValueChange={(value) => handleMappingChange(index, value)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">Ignore</SelectItem>
                          <SelectItem value="name">Name *</SelectItem>
                          <SelectItem value="email">Email *</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                          <SelectItem value="status">Status</SelectItem>
                          <SelectItem value="source">Source</SelectItem>
                          <SelectItem value="notes">Notes</SelectItem>
                          <SelectItem value="custom_fields">Custom Field</SelectItem>
                        </SelectContent>
                      </Select>
                      {mapping.dbField === 'custom_fields' && (
                        <Input
                          placeholder="Field name (e.g., company_name)"
                          value={mapping.customFieldKey || ''}
                          onChange={(e) => handleCustomFieldKeyChange(index, e.target.value)}
                          className="mt-2"
                        />
                      )}
                    </TableCell>
                    <TableCell>{getConfidenceBadge(mapping.confidence)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {mapping.sampleValue}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2">
            <Button onClick={reset} variant="outline" className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={importMutation.isPending || connectLiveMutation.isPending}
              variant="outline"
              className="flex-1"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import Once (${analysisResult.totalRows} rows)`
              )}
            </Button>
            <Button 
              onClick={handleConnectLive} 
              disabled={importMutation.isPending || connectLiveMutation.isPending}
              className="flex-1"
            >
              {connectLiveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect Live'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Import from Google Sheets
        </CardTitle>
        <CardDescription>
          Paste your Google Sheets URL and let AI automatically map the fields. 
          Make sure your sheet is set to "Anyone with the link can view".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sheet-url">Google Sheets URL</Label>
          <Input
            id="sheet-url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
        </div>

        <Button
          onClick={handleAnalyze}
          disabled={analyzeMutation.isPending}
          className="w-full"
        >
          {analyzeMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing Sheet...
            </>
          ) : (
            'Analyze Sheet'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
