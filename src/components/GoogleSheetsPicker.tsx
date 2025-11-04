import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GoogleSheetsPickerProps {
  onSelect: (spreadsheetId: string, sheetNames: string[]) => void;
}

export function GoogleSheetsPicker({ onSelect }: GoogleSheetsPickerProps) {
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>("");
  const [selectedSheetNames, setSelectedSheetNames] = useState<string[]>([]);

  // Fetch user's spreadsheets
  const { data: spreadsheetsData, isLoading: loadingSpreadsheets } = useQuery({
    queryKey: ['google-spreadsheets'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('google-sheets-list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      return data;
    },
  });

  // Fetch sheets/tabs for selected spreadsheet
  const { data: sheetsData, isLoading: loadingSheets } = useQuery({
    queryKey: ['google-sheets', selectedSpreadsheetId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke(
        `google-sheets-list?spreadsheetId=${selectedSpreadsheetId}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpreadsheetId,
  });

  const handleSpreadsheetChange = (spreadsheetId: string) => {
    setSelectedSpreadsheetId(spreadsheetId);
    setSelectedSheetNames([]);
  };

  const handleSheetToggle = (sheetName: string) => {
    setSelectedSheetNames(prev => 
      prev.includes(sheetName) 
        ? prev.filter(n => n !== sheetName)
        : [...prev, sheetName]
    );
  };

  const handleSelectAll = () => {
    if (sheetsData?.sheets) {
      setSelectedSheetNames(sheetsData.sheets.map((s: any) => s.title));
    }
  };

  const handleDeselectAll = () => {
    setSelectedSheetNames([]);
  };

  const handleAnalyze = () => {
    if (selectedSpreadsheetId && selectedSheetNames.length > 0) {
      onSelect(selectedSpreadsheetId, selectedSheetNames);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Select Google Sheet
        </CardTitle>
        <CardDescription>
          Choose a spreadsheet and tab to import or sync
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Spreadsheet selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Spreadsheet</label>
          {loadingSpreadsheets ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedSpreadsheetId} onValueChange={handleSpreadsheetChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a spreadsheet" />
              </SelectTrigger>
              <SelectContent>
                {spreadsheetsData?.spreadsheets?.map((sheet: any) => (
                  <SelectItem key={sheet.id} value={sheet.id}>
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>{sheet.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Sheet/Tab multi-selector */}
        {selectedSpreadsheetId && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Select Tabs ({selectedSheetNames.length} selected)
              </label>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSelectAll}
                  disabled={loadingSheets}
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDeselectAll}
                  disabled={loadingSheets || selectedSheetNames.length === 0}
                >
                  Deselect All
                </Button>
              </div>
            </div>
            
            {loadingSheets ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
                {sheetsData?.sheets?.map((sheet: any) => {
                  const isSelected = selectedSheetNames.includes(sheet.title);
                  return (
                    <label 
                      key={sheet.sheetId}
                      className="flex items-center gap-3 p-3 hover:bg-accent cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSheetToggle(sheet.title)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Sheet className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{sheet.title}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <Button 
              onClick={handleAnalyze}
              disabled={selectedSheetNames.length === 0}
              className="w-full"
            >
              Analyze Selected Sheets
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
