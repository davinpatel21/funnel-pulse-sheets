import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Deals() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: deals, isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*, leads(name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: leads } = useQuery({
    queryKey: ["leads-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, name, email");
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast({ title: "Deal deleted" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (deal: any) => {
      if (deal.id) {
        const { error } = await supabase.from("deals").update(deal).eq("id", deal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("deals").insert([deal]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setIsDialogOpen(false);
      setEditingDeal(null);
      toast({ title: editingDeal ? "Deal updated" : "Deal created" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const deal = {
      id: editingDeal?.id,
      lead_id: formData.get("lead_id") as string,
      revenue_amount: parseFloat(formData.get("revenue_amount") as string),
      cash_collected: parseFloat(formData.get("cash_collected") as string) || 0,
      fees_amount: parseFloat(formData.get("fees_amount") as string) || 0,
      status: formData.get("status") as string,
      closed_at: formData.get("status") === "closed_won" ? new Date().toISOString() : null,
    };
    saveMutation.mutate(deal);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Deals</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingDeal(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Deal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDeal ? "Edit Deal" : "Add New Deal"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="lead_id">Lead</Label>
                <Select name="lead_id" defaultValue={editingDeal?.lead_id} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a lead" />
                  </SelectTrigger>
                  <SelectContent>
                    {leads?.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.name} - {lead.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="revenue_amount">Revenue Amount</Label>
                <Input
                  id="revenue_amount"
                  name="revenue_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editingDeal?.revenue_amount}
                  required
                />
              </div>
              <div>
                <Label htmlFor="cash_collected">Cash Collected</Label>
                <Input
                  id="cash_collected"
                  name="cash_collected"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editingDeal?.cash_collected || 0}
                />
              </div>
              <div>
                <Label htmlFor="fees_amount">Fees Amount</Label>
                <Input
                  id="fees_amount"
                  name="fees_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editingDeal?.fees_amount || 0}
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue={editingDeal?.status || "pending"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="closed_won">Closed Won</SelectItem>
                    <SelectItem value="closed_lost">Closed Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">
                {editingDeal ? "Update" : "Create"} Deal
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Cash Collected</TableHead>
              <TableHead>Fees</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : deals?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center">No deals found</TableCell>
              </TableRow>
            ) : (
              deals?.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell className="font-medium">{deal.leads?.name}</TableCell>
                  <TableCell>${deal.revenue_amount.toLocaleString()}</TableCell>
                  <TableCell>${deal.cash_collected.toLocaleString()}</TableCell>
                  <TableCell>${deal.fees_amount.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className="capitalize">{deal.status.replace("_", " ")}</span>
                  </TableCell>
                  <TableCell>{new Date(deal.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingDeal(deal);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(deal.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
