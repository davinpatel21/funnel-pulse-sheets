import { useState } from "react";
import { useLiveSheetData } from "@/hooks/useLiveSheetData";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SheetDataBanner } from "@/components/SheetDataBanner";
import { SheetsNotConnected } from "@/components/SheetsNotConnected";
import { format, parseISO, isValid } from "date-fns";

export default function Calls() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: calls, isLoading, refetch, lastSyncedAt, sheetUrl, isConfigured } = useLiveSheetData('calls');

  const filteredCalls = calls.filter((call: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      call.lead_name?.toLowerCase().includes(search) ||
      call.lead_email?.toLowerCase().includes(search) ||
      call.closer_name?.toLowerCase().includes(search)
    );
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "connected":
      case "completed":
        return "default";
      case "no_answer":
      case "voicemail":
        return "secondary";
      case "rescheduled":
        return "outline";
      default:
        return "outline";
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const date = parseISO(dateStr);
      if (!isValid(date)) return dateStr;
      return format(date, "MMM d, yyyy h:mm a");
    } catch {
      return dateStr;
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds === 0) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  if (!isConfigured && !isLoading) {
    return <SheetsNotConnected entityName="calls" />;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Calls</h1>
      </div>

      <SheetDataBanner
        sheetUrl={sheetUrl}
        lastSyncedAt={lastSyncedAt}
        onRefresh={refetch}
        isLoading={isLoading}
        entityName="calls"
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search calls..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Call Time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Closer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recording</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  Loading from Google Sheets...
                </TableCell>
              </TableRow>
            ) : filteredCalls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  No calls found
                </TableCell>
              </TableRow>
            ) : (
              filteredCalls.map((call: any) => (
                <TableRow key={call.call_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{call.lead_name || "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">{call.lead_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(call.call_time)}</TableCell>
                  <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                  <TableCell>{call.closer_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(call.status)}>
                      {call.status?.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {call.recording_url ? (
                      <a 
                        href={call.recording_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        🎥 View
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {call.call_notes || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
