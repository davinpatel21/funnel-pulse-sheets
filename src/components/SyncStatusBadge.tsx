import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface SyncStatusBadgeProps {
  status?: 'synced' | 'modified_locally' | 'conflict' | 'pending';
}

export function SyncStatusBadge({ status = 'synced' }: SyncStatusBadgeProps) {
  if (!status || status === 'synced') {
    return (
      <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200">
        <CheckCircle2 className="h-3 w-3" />
        Synced
      </Badge>
    );
  }

  if (status === 'modified_locally' || status === 'pending') {
    return (
      <Badge variant="outline" className="gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }

  if (status === 'conflict') {
    return (
      <Badge variant="outline" className="gap-1 bg-red-50 text-red-700 border-red-200">
        <AlertTriangle className="h-3 w-3" />
        Conflict
      </Badge>
    );
  }

  return null;
}
