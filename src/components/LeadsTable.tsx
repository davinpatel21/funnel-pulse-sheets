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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  email: string;
  status: string;
  source?: string;
  phone?: string;
}

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-info/10 text-info border-info/20",
  qualified: "bg-success/10 text-success border-success/20",
  unqualified: "bg-muted text-muted-foreground border-border"
};

export const LeadsTable = () => {
  // Fetch leads directly from database
  const { data: leads, isLoading } = useQuery({
    queryKey: ['recent-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data as Lead[];
    },
  });
  if (isLoading) {
    return (
      <Card className="p-6 bg-gradient-card shadow-card border border-border">
        <h2 className="text-xl font-bold text-foreground mb-4">Recent Leads</h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <Card className="p-6 bg-gradient-card shadow-card border border-border">
        <h2 className="text-xl font-bold text-foreground mb-4">Recent Leads</h2>
        <div className="text-center py-8 text-muted-foreground">
          <p>No leads data available.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-card shadow-card hover:shadow-intense border border-border transition-all duration-500 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground mb-4">Recent Leads</h2>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Phone</TableHead>
              <TableHead className="font-semibold">Source</TableHead>
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
                <TableCell className="text-muted-foreground">{lead.phone || '—'}</TableCell>
                <TableCell className="capitalize">{lead.source || 'other'}</TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`${statusColors[lead.status] || statusColors.new} transition-all duration-300 hover:scale-110`}
                  >
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
