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

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: leads, isLoading, refetch, lastSyncedAt, sheetUrl, isConfigured } = useLiveSheetData('leads');

  const filteredLeads = leads.filter((lead: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      lead.full_name?.toLowerCase().includes(search) ||
      lead.email?.toLowerCase().includes(search) ||
      lead.phone?.toLowerCase().includes(search)
    );
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "won":
        return "default";
      case "booked":
      case "showed":
        return "secondary";
      case "lost":
      case "unqualified":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (!isConfigured && !isLoading) {
    return <SheetsNotConnected entityName="leads" />;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Leads</h1>
      </div>

      <SheetDataBanner
        sheetUrl={sheetUrl}
        lastSyncedAt={lastSyncedAt}
        onRefresh={refetch}
        isLoading={isLoading}
        entityName="leads"
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Source</TableHead>
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
            ) : filteredLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  No leads found
                </TableCell>
              </TableRow>
            ) : (
              filteredLeads.map((lead: any) => (
                <TableRow key={lead.lead_id}>
                  <TableCell className="font-medium">{lead.full_name}</TableCell>
                  <TableCell>{lead.email || "—"}</TableCell>
                  <TableCell>{lead.phone || "—"}</TableCell>
                  <TableCell>
                    <span className="capitalize">{lead.source || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(lead.status)}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {lead.notes || "—"}
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
