import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Lead {
  id: string;
  name: string;
  email: string;
  stage: string;
  value: string;
  status: "hot" | "warm" | "cold";
}

const leads: Lead[] = [
  { id: "1", name: "John Anderson", email: "john@company.com", stage: "Proposal Sent", value: "$15,000", status: "hot" },
  { id: "2", name: "Sarah Miller", email: "sarah@business.com", stage: "Consultation Booked", value: "$12,000", status: "warm" },
  { id: "3", name: "Michael Chen", email: "michael@enterprise.com", stage: "Qualified Lead", value: "$20,000", status: "hot" },
  { id: "4", name: "Emily Davis", email: "emily@startup.com", stage: "Proposal Sent", value: "$8,000", status: "warm" },
  { id: "5", name: "David Wilson", email: "david@corp.com", stage: "Closed Won", value: "$25,000", status: "hot" },
];

const statusColors = {
  hot: "bg-destructive/10 text-destructive border-destructive/20",
  warm: "bg-warning/10 text-warning border-warning/20",
  cold: "bg-muted text-muted-foreground border-border"
};

export const LeadsTable = () => {
  return (
    <Card className="p-6 bg-gradient-card shadow-card hover:shadow-intense border border-border transition-all duration-500 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground mb-4">Recent Leads</h2>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Stage</TableHead>
              <TableHead className="font-semibold">Value</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead, index) => (
              <TableRow 
                key={lead.id} 
                className="hover:bg-muted/30 transition-all duration-300 hover:scale-[1.01] animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell className="text-muted-foreground">{lead.email}</TableCell>
                <TableCell>{lead.stage}</TableCell>
                <TableCell className="font-semibold text-foreground">{lead.value}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`${statusColors[lead.status]} transition-all duration-300 hover:scale-110`}>
                    {lead.status.toUpperCase()}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};
