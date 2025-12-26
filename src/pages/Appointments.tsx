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

export default function Appointments() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: appointments, isLoading, refetch, lastSyncedAt, sheetUrl, isConfigured } = useLiveSheetData('appointments');

  const filteredAppointments = appointments.filter((appt: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      appt.lead_name?.toLowerCase().includes(search) ||
      appt.lead_email?.toLowerCase().includes(search) ||
      appt.setter_name?.toLowerCase().includes(search) ||
      appt.closer_name?.toLowerCase().includes(search)
    );
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "booked":
        return "secondary";
      case "no_show":
      case "cancelled":
        return "destructive";
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

  if (!isConfigured && !isLoading) {
    return <SheetsNotConnected entityName="appointments" />;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Appointments</h1>
      </div>

      <SheetDataBanner
        sheetUrl={sheetUrl}
        lastSyncedAt={lastSyncedAt}
        onRefresh={refetch}
        isLoading={isLoading}
        entityName="appointments"
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search appointments..."
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
              <TableHead>Scheduled For</TableHead>
              <TableHead>Setter</TableHead>
              <TableHead>Closer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Loading from Google Sheets...
                </TableCell>
              </TableRow>
            ) : filteredAppointments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  No appointments found
                </TableCell>
              </TableRow>
            ) : (
              filteredAppointments.map((appt: any) => (
                <TableRow key={appt.appointment_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{appt.lead_name || "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">{appt.lead_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(appt.scheduled_for)}</TableCell>
                  <TableCell>{appt.setter_name || "—"}</TableCell>
                  <TableCell>{appt.closer_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(appt.status)}>
                      {appt.status?.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {appt.notes || "—"}
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
