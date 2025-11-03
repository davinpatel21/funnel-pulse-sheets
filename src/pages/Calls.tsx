import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSheetConfigurations } from "@/hooks/useSheetConfigurations";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Calls() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch database calls
  const { data: dbCalls, isLoading: isLoadingDb } = useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("*, leads(name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch live sheet calls
  const { data: configs } = useSheetConfigurations();
  const callsConfig = configs?.find(c => c.sheet_type === 'calls');
  
  const { data: liveCalls, isLoading: isLoadingLive } = useQuery({
    queryKey: ['live-calls', callsConfig?.id],
    queryFn: async () => {
      if (!callsConfig) return [];
      
      const { data } = await supabase.functions.invoke('google-sheets-live', {
        body: { configuration_id: callsConfig.id }
      });
      
      // Transform live data to match call structure
      return (data?.data || []).map((record: any) => ({
        id: `live-${record.email || record.name}`,
        lead_id: null,
        duration_minutes: record.custom_fields?.duration || record.custom_fields?.call_duration,
        was_live: record.custom_fields?.was_live !== 'voicemail',
        notes: record.notes || '',
        caller_id: null,
        appointment_id: null,
        created_at: record.custom_fields?.call_time || new Date().toISOString(),
        leads: { name: record.name, email: record.email },
        isLive: true
      }));
    },
    enabled: !!callsConfig,
    staleTime: 2 * 60 * 1000,
  });

  // Merge database + live calls
  const calls = [...(dbCalls || []), ...(liveCalls || [])];
  const isLoading = isLoadingDb || isLoadingLive;

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
      const { error } = await supabase.from("calls").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      toast({ title: "Call deleted" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (call: any) => {
      const { error } = await supabase.from("calls").insert([call]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      setIsDialogOpen(false);
      toast({ title: "Call logged" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const call = {
      lead_id: formData.get("lead_id") as string,
      duration_minutes: parseInt(formData.get("duration_minutes") as string),
      was_live: formData.get("was_live") === "on",
      notes: formData.get("notes") as string,
    };
    saveMutation.mutate(call);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Calls</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Log Call
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log New Call</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="lead_id">Lead</Label>
                <Select name="lead_id" required>
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
                <Label htmlFor="duration_minutes">Duration (minutes)</Label>
                <Input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min="0"
                  defaultValue="0"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="was_live" name="was_live" defaultChecked />
                <Label htmlFor="was_live">Was Live (not voicemail)</Label>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" />
              </div>
              <Button type="submit" className="w-full">
                Log Call
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
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : calls?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">No calls logged</TableCell>
              </TableRow>
            ) : (
              calls?.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="font-medium">{call.leads?.name}</TableCell>
                  <TableCell>{call.duration_minutes} min</TableCell>
                  <TableCell>{call.was_live ? "Live" : "Voicemail"}</TableCell>
                  <TableCell>{call.notes}</TableCell>
                  <TableCell>{new Date(call.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(call.id)}
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
