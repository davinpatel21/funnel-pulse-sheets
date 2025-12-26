import { ExternalLink, RefreshCw, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface SheetDataBannerProps {
  sheetUrl: string | null;
  lastSyncedAt: string | null;
  onRefresh: () => void;
  isLoading?: boolean;
  entityName: string;
}

export function SheetDataBanner({ 
  sheetUrl, 
  lastSyncedAt, 
  onRefresh, 
  isLoading,
  entityName 
}: SheetDataBannerProps) {
  const syncTimeText = lastSyncedAt 
    ? `Last synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}`
    : 'Not synced yet';

  return (
    <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Table2 className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Viewing {entityName} from Google Sheets
          </p>
          <p className="text-xs text-muted-foreground">
            {syncTimeText} • Edit directly in Google Sheets
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        {sheetUrl && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(sheetUrl, '_blank')}
            className="gap-2"
          >
            <ExternalLink className="h-3 w-3" />
            Open Sheet
          </Button>
        )}
      </div>
    </div>
  );
}
