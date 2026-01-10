import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileSpreadsheet, Search, FolderOpen, ChevronRight, Table2 } from "lucide-react";
import { invokeWithAuth } from "@/lib/authHelpers";
import { formatDistanceToNow } from "date-fns";

interface SpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
}

interface SheetTab {
  sheetId: number;
  title: string;
  rowCount: number;
}

interface GoogleSheetsFilePickerProps {
  onSelect: (spreadsheetId: string, spreadsheetName: string, sheetId: number, sheetTitle: string) => void;
  isLoading?: boolean;
}

export function GoogleSheetsFilePicker({ onSelect, isLoading }: GoogleSheetsFilePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SpreadsheetFile | null>(null);
  const [selectedTab, setSelectedTab] = useState<SheetTab | null>(null);

  // Fetch list of spreadsheets
  const { 
    data: spreadsheets, 
    isLoading: isLoadingFiles, 
    error: filesError,
    refetch: refetchFiles 
  } = useQuery({
    queryKey: ['google-sheets-list'],
    queryFn: async () => {
      const { data, error } = await invokeWithAuth('google-sheets-list');
      if (error) throw error;
      return data?.files as SpreadsheetFile[] || [];
    },
  });

  // Fetch tabs for selected spreadsheet
  const { 
    data: tabsData, 
    isLoading: isLoadingTabs,
    error: tabsError 
  } = useQuery({
    queryKey: ['google-sheets-tabs', selectedSpreadsheet?.id],
    queryFn: async () => {
      if (!selectedSpreadsheet) return null;
      const { data, error } = await invokeWithAuth(
        `google-sheets-tabs?spreadsheetId=${selectedSpreadsheet.id}`
      );
      if (error) throw error;
      return data as { spreadsheetId: string; title: string; sheets: SheetTab[] };
    },
    enabled: !!selectedSpreadsheet,
  });

  const filteredSpreadsheets = spreadsheets?.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleSpreadsheetSelect = (file: SpreadsheetFile) => {
    setSelectedSpreadsheet(file);
    setSelectedTab(null);
  };

  const handleTabSelect = (sheetId: string) => {
    const tab = tabsData?.sheets.find(s => s.sheetId.toString() === sheetId);
    if (tab) {
      setSelectedTab(tab);
    }
  };

  const handleAnalyze = () => {
    if (selectedSpreadsheet && selectedTab) {
      onSelect(
        selectedSpreadsheet.id, 
        selectedSpreadsheet.name, 
        selectedTab.sheetId, 
        selectedTab.title
      );
    }
  };

  const handleBack = () => {
    setSelectedSpreadsheet(null);
    setSelectedTab(null);
  };

  // Error state
  if (filesError) {
    const errorMessage = filesError instanceof Error ? filesError.message : 'Failed to load spreadsheets';
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Select Spreadsheet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-4">
            <p className="text-destructive">{errorMessage}</p>
            {errorMessage.includes('reconnect') && (
              <p className="text-sm text-muted-foreground">
                You may need to disconnect and reconnect your Google account with updated permissions.
              </p>
            )}
            <Button variant="outline" onClick={() => refetchFiles()}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Spreadsheet selected - show tabs
  if (selectedSpreadsheet) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack} className="h-8 px-2">
              ← Back
            </Button>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                {selectedSpreadsheet.name}
              </CardTitle>
              <CardDescription>Select a tab to analyze</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingTabs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading tabs...</span>
            </div>
          ) : tabsError ? (
            <div className="text-center py-8">
              <p className="text-destructive">Failed to load tabs</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Select Tab</Label>
                <Select value={selectedTab?.sheetId.toString() || ""} onValueChange={handleTabSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a tab..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tabsData?.sheets.map((tab) => (
                      <SelectItem key={tab.sheetId} value={tab.sheetId.toString()}>
                        <div className="flex items-center gap-2">
                          <Table2 className="h-4 w-4 text-muted-foreground" />
                          <span>{tab.title}</span>
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {tab.rowCount} rows
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTab && (
                <div className="pt-4">
                  <Button 
                    onClick={handleAnalyze} 
                    disabled={isLoading}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4" />
                        Analyze "{selectedTab.title}" with AI
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // Main file picker view
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Select a Spreadsheet
        </CardTitle>
        <CardDescription>
          Choose from your Google Drive spreadsheets
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search spreadsheets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* File list */}
        <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading spreadsheets...</span>
            </div>
          ) : filteredSpreadsheets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? 'No spreadsheets match your search' : 'No spreadsheets found'}
            </div>
          ) : (
            filteredSpreadsheets.map((file) => (
              <button
                key={file.id}
                onClick={() => handleSpreadsheetSelect(file)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Modified {formatDistanceToNow(new Date(file.modifiedTime), { addSuffix: true })}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
