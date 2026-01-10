import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileSpreadsheet, Search, FolderOpen, ChevronRight, Table2, Sparkles } from "lucide-react";
import { invokeWithAuth } from "@/lib/authHelpers";
import { formatDistanceToNow } from "date-fns";
import { debugLog, debugError, createTimedOperation, formatErrorForDisplay } from "@/lib/debugLogger";

interface SpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
}

export interface SheetTab {
  sheetId: number;
  title: string;
  rowCount: number;
}

// Known entity types that we can auto-detect
const KNOWN_ENTITY_TYPES = ['team', 'leads', 'appointments', 'calls', 'deals'];

function detectEntityType(tabTitle: string): string | null {
  const lower = tabTitle.toLowerCase().trim();
  for (const entity of KNOWN_ENTITY_TYPES) {
    if (lower.includes(entity) || lower === entity) {
      return entity;
    }
  }
  // Additional common variations
  if (lower.includes('roster') || lower.includes('members') || lower.includes('staff')) return 'team';
  if (lower.includes('prospect') || lower.includes('contact')) return 'leads';
  if (lower.includes('meeting') || lower.includes('booking') || lower.includes('calendar')) return 'appointments';
  if (lower.includes('revenue') || lower.includes('sales') || lower.includes('closed')) return 'deals';
  return null;
}

interface GoogleSheetsFilePickerProps {
  onSelect: (spreadsheetId: string, spreadsheetName: string, selectedTabs: SheetTab[]) => void;
  isLoading?: boolean;
}

export function GoogleSheetsFilePicker({ onSelect, isLoading }: GoogleSheetsFilePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SpreadsheetFile | null>(null);
  const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set());

  // Fetch list of spreadsheets
  const { 
    data: spreadsheets, 
    isLoading: isLoadingFiles, 
    error: filesError,
    refetch: refetchFiles 
  } = useQuery({
    queryKey: ['google-sheets-list'],
    queryFn: async () => {
      const timer = createTimedOperation('GoogleSheetsFilePicker', 'list spreadsheets');
      debugLog('GoogleSheetsFilePicker', 'Fetching spreadsheet list');
      
      const { data, error } = await invokeWithAuth('google-sheets-list');
      
      if (error) {
        debugError('GoogleSheetsFilePicker', 'Failed to list spreadsheets', error, {
          requestId: (error as any).requestId,
        });
        throw error;
      }
      
      const files = data?.files as SpreadsheetFile[] || [];
      timer.success(`Found ${files.length} spreadsheets`);
      return files;
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
      
      const timer = createTimedOperation('GoogleSheetsFilePicker', `tabs for ${selectedSpreadsheet.name}`);
      debugLog('GoogleSheetsFilePicker', 'Fetching tabs', { spreadsheetId: selectedSpreadsheet.id });
      
      const { data, error } = await invokeWithAuth(
        `google-sheets-tabs?spreadsheetId=${selectedSpreadsheet.id}`
      );
      
      if (error) {
        debugError('GoogleSheetsFilePicker', 'Failed to fetch tabs', error, {
          spreadsheetId: selectedSpreadsheet.id,
          requestId: (error as any).requestId,
        });
        throw error;
      }
      
      const result = data as { spreadsheetId: string; title: string; sheets: SheetTab[] };
      timer.success(`Found ${result?.sheets?.length || 0} tabs`);
      return result;
    },
    enabled: !!selectedSpreadsheet,
  });

  // Auto-select recognized tabs when tabs load
  const filteredSpreadsheets = spreadsheets?.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleSpreadsheetSelect = (file: SpreadsheetFile) => {
    setSelectedSpreadsheet(file);
    setSelectedTabIds(new Set());
  };

  // Auto-detect and pre-select tabs when tabsData loads
  const getAutoSelectedTabs = (): Set<number> => {
    if (!tabsData?.sheets) return new Set();
    const autoSelected = new Set<number>();
    tabsData.sheets.forEach(tab => {
      if (detectEntityType(tab.title)) {
        autoSelected.add(tab.sheetId);
      }
    });
    return autoSelected;
  };

  // Initialize selection when tabs load
  if (tabsData?.sheets && selectedTabIds.size === 0) {
    const autoSelected = getAutoSelectedTabs();
    if (autoSelected.size > 0 && selectedTabIds.size === 0) {
      setSelectedTabIds(autoSelected);
    }
  }

  const handleTabToggle = (sheetId: number, checked: boolean) => {
    const newSelected = new Set(selectedTabIds);
    if (checked) {
      newSelected.add(sheetId);
    } else {
      newSelected.delete(sheetId);
    }
    setSelectedTabIds(newSelected);
  };

  const handleSelectAll = () => {
    if (!tabsData?.sheets) return;
    setSelectedTabIds(new Set(tabsData.sheets.map(t => t.sheetId)));
  };

  const handleSelectNone = () => {
    setSelectedTabIds(new Set());
  };

  const handleSyncSelected = () => {
    if (!selectedSpreadsheet || !tabsData?.sheets) return;
    const selectedTabs = tabsData.sheets.filter(tab => selectedTabIds.has(tab.sheetId));
    if (selectedTabs.length === 0) return;
    
    onSelect(selectedSpreadsheet.id, selectedSpreadsheet.name, selectedTabs);
  };

  const handleBack = () => {
    setSelectedSpreadsheet(null);
    setSelectedTabIds(new Set());
  };

  // Error state
  if (filesError) {
    const errorMessage = filesError instanceof Error ? formatErrorForDisplay(filesError) : 'Failed to load spreadsheets';
    const requestId = (filesError as any)?.requestId;
    
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
            {requestId && (
              <p className="text-xs text-muted-foreground font-mono">
                Request ID: {requestId}
              </p>
            )}
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

  // Spreadsheet selected - show tabs with checkboxes
  if (selectedSpreadsheet) {
    const recognizedCount = tabsData?.sheets?.filter(t => detectEntityType(t.title)).length || 0;
    
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
              <CardDescription>Select tabs to sync with your dashboard</CardDescription>
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
              {/* Auto-detection notice */}
              {recognizedCount > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">
                      {recognizedCount} tab{recognizedCount !== 1 ? 's' : ''} auto-detected
                    </p>
                    <p className="text-muted-foreground">
                      We found tabs that match known data types (Team, Leads, Appointments, Calls, Deals).
                    </p>
                  </div>
                </div>
              )}

              {/* Select all / none buttons */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedTabIds.size} of {tabsData?.sheets?.length || 0} tabs selected
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSelectNone}>
                    Clear
                  </Button>
                </div>
              </div>

              {/* Tab list with checkboxes */}
              <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                {tabsData?.sheets?.map((tab) => {
                  const entityType = detectEntityType(tab.title);
                  const isSelected = selectedTabIds.has(tab.sheetId);
                  
                  return (
                    <label
                      key={tab.sheetId}
                      className={`flex items-center gap-3 p-4 cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleTabToggle(tab.sheetId, !!checked)}
                      />
                      <Table2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tab.title}</span>
                          {entityType && (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {entityType}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {tab.rowCount} rows
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Sync button */}
              <Button 
                onClick={handleSyncSelected} 
                disabled={isLoading || selectedTabIds.size === 0}
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
                    <Sparkles className="h-4 w-4" />
                    Analyze {selectedTabIds.size} Tab{selectedTabIds.size !== 1 ? 's' : ''} with AI
                  </>
                )}
              </Button>
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
          Choose from your Google Drive spreadsheets. You can select multiple tabs to sync.
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
