import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, Sheet } from "lucide-react";

interface GoogleSheetsPickerProps {
  onSelect: (spreadsheetId: string, sheetName: string) => void;
}

export function GoogleSheetsPicker({ onSelect }: GoogleSheetsPickerProps) {
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>("");
  const [selectedSheetName, setSelectedSheetName] = useState<string>("");

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
    setSelectedSheetName("");
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheetName(sheetName);
    if (selectedSpreadsheetId) {
      onSelect(selectedSpreadsheetId, sheetName);
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

        {/* Sheet/Tab selector */}
        {selectedSpreadsheetId && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Sheet/Tab</label>
            {loadingSheets ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selectedSheetName} onValueChange={handleSheetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a sheet" />
                </SelectTrigger>
                <SelectContent>
                  {sheetsData?.sheets?.map((sheet: any) => (
                    <SelectItem key={sheet.sheetId} value={sheet.title}>
                      <div className="flex items-center gap-2">
                        <Sheet className="h-4 w-4" />
                        <span>{sheet.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
