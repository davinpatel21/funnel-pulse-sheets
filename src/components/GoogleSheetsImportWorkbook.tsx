import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GoogleSheetsPicker } from "./GoogleSheetsPicker";

interface SheetAnalysis {
  sheetName: string;
  sheetType: string;
  confidence: number;
  headers: string[];
  totalRows: number;
  mappings: any[];
  warnings: string[];
  suggestedDefaults: Record<string, any>;
  sampleRows: any[];
}

export function GoogleSheetsImportWorkbook() {
  const [step, setStep] = useState<'select' | 'review' | 'importing' | 'complete'>('select');
  const [spreadsheetId, setSpreadsheetId] = useState<string>("");
  const [workbookAnalysis, setWorkbookAnalysis] = useState<SheetAnalysis[]>([]);
  const [batchResults, setBatchResults] = useState<any>(null);
  const { toast } = useToast();

  const analyzeMutation = useMutation({
    mutationFn: async ({ spreadsheetId, sheetNames }: { spreadsheetId: string; sheetNames: string[] }) => {
      const { data, error } = await supabase.functions.invoke('google-sheets-import?action=analyze-workbook', {
        body: { spreadsheetId, sheetNames },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setWorkbookAnalysis(data.workbookAnalysis);
      setStep('review');
      toast({ title: `Analyzed ${data.workbookAnalysis.length} sheets successfully!` });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to analyze workbook",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (mode: 'once' | 'live') => {
      const sheets = workbookAnalysis.map(analysis => ({
        sheetName: analysis.sheetName,
        sheetType: analysis.sheetType,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        mappings: analysis.mappings,
        defaults: analysis.suggestedDefaults,
      }));

      if (mode === 'once') {
        const { data, error } = await supabase.functions.invoke('google-sheets-import?action=batch-import', {
          body: { sheets },
        });

        if (error) throw error;
        return { mode: 'once', ...data };
      } else {
        // Create multiple sheet_configurations
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) throw new Error('Not authenticated');

        const configs = sheets.map(sheet => ({
          user_id: user.user.id,
          sheet_url: sheet.sheetUrl,
          sheet_type: sheet.sheetType,
          mappings: sheet.mappings,
          is_active: true,
        }));

        const { data, error } = await supabase
          .from('sheet_configurations')
          .insert(configs)
          .select();

        if (error) throw error;
        return { mode: 'live', configs: data };
      }
    },
    onSuccess: (data) => {
      if (data.mode === 'once') {
        setBatchResults(data);
        setStep('complete');
        toast({
          title: "Import completed!",
          description: `${data.totalImported} records imported from ${workbookAnalysis.length} sheets`,
        });
      } else {
        toast({
          title: "Sheets connected!",
          description: `${workbookAnalysis.length} sheets connected for live sync`,
        });
        reset();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSheetsSelected = (spreadsheetId: string, sheetNames: string[]) => {
    setSpreadsheetId(spreadsheetId);
    analyzeMutation.mutate({ spreadsheetId, sheetNames });
  };

  const handleSheetTypeChange = (index: number, newType: string) => {
    const updated = [...workbookAnalysis];
    updated[index].sheetType = newType;
    setWorkbookAnalysis(updated);
  };

  const reset = () => {
    setStep('select');
    setSpreadsheetId("");
    setWorkbookAnalysis([]);
    setBatchResults(null);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) {
      return <Badge variant="default" className="bg-green-600">● {confidence}% High</Badge>;
    } else if (confidence >= 50) {
      return <Badge variant="secondary" className="bg-yellow-600">● {confidence}% Medium</Badge>;
    } else {
      return <Badge variant="destructive">○ {confidence}% Low</Badge>;
    }
  };

  if (step === 'complete' && batchResults) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Batch Import Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-lg">
              <span className="text-muted-foreground">Total imported:</span>
              <span className="font-bold text-green-600">{batchResults.totalImported} records</span>
            </div>
            {batchResults.totalFailed > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Failed:</span>
                <span className="font-bold text-red-600">{batchResults.totalFailed} records</span>
              </div>
            )}
          </div>

          <div className="border rounded-lg divide-y">
            <div className="p-3 bg-muted/50 font-medium">Details by Sheet</div>
            {batchResults.results.map((result: any, i: number) => (
              <div key={i} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-medium">{result.sheetName}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {result.imported}/{result.imported + result.failed} rows
                  {result.errors?.length > 0 && ` (${result.errors.length} errors)`}
                </span>
              </div>
            ))}
          </div>

          <Button onClick={reset} className="w-full">
            Import Another Workbook
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 'importing') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Importing {workbookAnalysis.length} sheets...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {workbookAnalysis.map((sheet, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{sheet.sheetName} ({sheet.totalRows} rows)</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'review') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Detected Sheets</CardTitle>
          <CardDescription>
            AI detected {workbookAnalysis.length} sheets. Review sheet types before importing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sheet Name</TableHead>
                  <TableHead>Detected Type</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workbookAnalysis.map((sheet, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{sheet.sheetName}</TableCell>
                    <TableCell>
                      <Select
                        value={sheet.sheetType}
                        onValueChange={(value) => handleSheetTypeChange(index, value)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="team_roster">Team Roster</SelectItem>
                          <SelectItem value="leads">Leads</SelectItem>
                          <SelectItem value="appointments">Appointments</SelectItem>
                          <SelectItem value="calls">Calls</SelectItem>
                          <SelectItem value="deals">Deals</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{sheet.totalRows}</TableCell>
                    <TableCell>{getConfidenceBadge(sheet.confidence)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {workbookAnalysis.some(s => s.warnings.length > 0) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 space-y-1">
              {workbookAnalysis.flatMap((s, i) => 
                s.warnings.map((w, j) => (
                  <div key={`${i}-${j}`} className="text-sm text-yellow-800 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span><strong>{s.sheetName}:</strong> {w}</span>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={reset} variant="outline" className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={() => {
                setStep('importing');
                importMutation.mutate('once');
              }}
              disabled={importMutation.isPending}
              variant="outline"
              className="flex-1"
            >
              Import All Once
            </Button>
            <Button 
              onClick={() => importMutation.mutate('live')}
              disabled={importMutation.isPending}
              className="flex-1"
            >
              Connect All Live
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <GoogleSheetsPicker onSelect={handleSheetsSelected} />
      {analyzeMutation.isPending && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Analyzing sheets...</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
