import { useSyncStatus, SyncStatus } from "@/hooks/useSyncStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

const statusConfig: Record<SyncStatus, { 
  label: string; 
  bgColor: string; 
  textColor: string; 
  dotColor: string;
  animate: boolean;
}> = {
  connected: {
    label: 'Connected',
    bgColor: 'bg-success/10',
    textColor: 'text-success',
    dotColor: 'bg-success',
    animate: true,
  },
  disconnected: {
    label: 'Disconnected',
    bgColor: 'bg-muted',
    textColor: 'text-muted-foreground',
    dotColor: 'bg-muted-foreground',
    animate: false,
  },
  'no-sheets': {
    label: 'Setup Required',
    bgColor: 'bg-warning/10',
    textColor: 'text-warning',
    dotColor: 'bg-warning',
    animate: false,
  },
  syncing: {
    label: 'Syncing...',
    bgColor: 'bg-primary/10',
    textColor: 'text-primary',
    dotColor: 'bg-primary',
    animate: true,
  },
  error: {
    label: 'Error',
    bgColor: 'bg-destructive/10',
    textColor: 'text-destructive',
    dotColor: 'bg-destructive',
    animate: false,
  },
};

export function SyncStatusIndicator() {
  const { status, lastSyncedAt, hasCredentials, hasSheetConfigs } = useSyncStatus();
  const config = statusConfig[status];

  const tooltipContent = () => {
    if (status === 'disconnected') {
      return (
        <div className="text-center">
          <p className="font-medium">Google Sheets not connected</p>
          <p className="text-xs text-muted-foreground">Go to Settings to connect</p>
        </div>
      );
    }
    if (status === 'no-sheets') {
      return (
        <div className="text-center">
          <p className="font-medium">No sheets configured</p>
          <p className="text-xs text-muted-foreground">Add a sheet in Settings to start tracking</p>
        </div>
      );
    }
    if (status === 'connected' && lastSyncedAt) {
      return (
        <div className="text-center">
          <p className="font-medium">Google Sheets connected</p>
          <p className="text-xs text-muted-foreground">
            Last synced {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
          </p>
        </div>
      );
    }
    return <p>{config.label}</p>;
  };

  const indicator = (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bgColor} border border-current/20`}>
      <div className={`w-2 h-2 rounded-full ${config.dotColor} ${config.animate ? 'animate-pulse' : ''}`} />
      <span className={`text-xs font-medium ${config.textColor}`}>
        {config.label}
      </span>
    </div>
  );

  // If disconnected or no sheets, make it clickable to go to settings
  if (status === 'disconnected' || status === 'no-sheets') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/settings" className="cursor-pointer hover:opacity-80 transition-opacity">
            {indicator}
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          {tooltipContent()}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {indicator}
      </TooltipTrigger>
      <TooltipContent>
        {tooltipContent()}
      </TooltipContent>
    </Tooltip>
  );
}
