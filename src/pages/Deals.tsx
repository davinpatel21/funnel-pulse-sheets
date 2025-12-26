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

export default function Deals() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: deals, isLoading, refetch, lastSyncedAt, sheetUrl, isConfigured } = useLiveSheetData('deals');

  const filteredDeals = deals.filter((deal: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      deal.lead_name?.toLowerCase().includes(search) ||
      deal.lead_email?.toLowerCase().includes(search) ||
      deal.closer_name?.toLowerCase().includes(search)
    );
  });

  const getStageBadgeVariant = (stage: string) => {
    switch (stage) {
      case "won":
        return "default";
      case "pipeline":
        return "secondary";
      case "lost":
        return "destructive";
      case "refund":
      case "chargeback":
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
      return format(date, "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount || 0);
  };

  if (!isConfigured && !isLoading) {
    return <SheetsNotConnected entityName="deals" />;
  }

  // Calculate totals
  const totalAmount = filteredDeals.reduce((sum: number, deal: any) => sum + (deal.amount || 0), 0);
  const totalCollected = filteredDeals.reduce((sum: number, deal: any) => sum + (deal.cash_collected || 0), 0);
  const wonDeals = filteredDeals.filter((d: any) => d.stage === 'won').length;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Deals</h1>
          <p className="text-muted-foreground mt-1">
            {wonDeals} won • {formatCurrency(totalAmount)} total • {formatCurrency(totalCollected)} collected
          </p>
        </div>
      </div>

      <SheetDataBanner
        sheetUrl={sheetUrl}
        lastSyncedAt={lastSyncedAt}
        onRefresh={refetch}
        isLoading={isLoading}
        entityName="deals"
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
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
              <TableHead>Closer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Cash Collected</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Close Date</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  Loading from Google Sheets...
                </TableCell>
              </TableRow>
            ) : filteredDeals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  No deals found
                </TableCell>
              </TableRow>
            ) : (
              filteredDeals.map((deal: any) => (
                <TableRow key={deal.deal_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{deal.lead_name || "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">{deal.lead_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{deal.closer_name || "—"}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(deal.amount, deal.currency)}
                  </TableCell>
                  <TableCell>{formatCurrency(deal.cash_collected, deal.currency)}</TableCell>
                  <TableCell>{deal.payment_platform || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={getStageBadgeVariant(deal.stage)}>
                      {deal.stage}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(deal.close_date)}</TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {deal.notes || deal.loss_reason || "—"}
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
