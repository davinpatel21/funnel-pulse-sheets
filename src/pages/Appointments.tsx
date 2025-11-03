import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSheetConfigurations } from "@/hooks/useSheetConfigurations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2, Edit } from "lucide-react";
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

export default function Appointments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch database appointments
  const { data: dbAppointments, isLoading: isLoadingDb } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, leads(name, email)")
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch live sheet appointments
  const { data: configs } = useSheetConfigurations();
  const appointmentsConfig = configs?.find(c => c.sheet_type === 'appointments');
  
  const { data: liveAppointments, isLoading: isLoadingLive } = useQuery({
    queryKey: ['live-appointments', appointmentsConfig?.id],
    queryFn: async () => {
      if (!appointmentsConfig) return [];
      
      const { data } = await supabase.functions.invoke('google-sheets-live', {
        body: { configuration_id: appointmentsConfig.id }
      });
      
      // Transform live data to match appointment structure
      return (data?.data || []).map((record: any) => ({
        id: `live-${record.email || record.name}`,
        lead_id: null,
        scheduled_at: record.custom_fields?.scheduled_for || record.custom_fields?.booking_time,
        status: record.status || 'scheduled',
        notes: record.notes || '',
        setter_id: null,
        closer_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        leads: { name: record.name, email: record.email },
        isLive: true
      }));
    },
    enabled: !!appointmentsConfig,
    staleTime: 2 * 60 * 1000,
  });

  // Merge database + live appointments
  const appointments = [...(dbAppointments || []), ...(liveAppointments || [])];
  const isLoading = isLoadingDb || isLoadingLive;

  const { data: leads } = useQuery({
    queryKey: ["leads-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, name, email");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, role").in("role", ["setter", "closer"]);
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Appointment deleted" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (appointment: any) => {
      if (appointment.id) {
        const { error } = await supabase.from("appointments").update(appointment).eq("id", appointment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("appointments").insert([appointment]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsDialogOpen(false);
      setEditingAppointment(null);
      toast({ title: editingAppointment ? "Appointment updated" : "Appointment created" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const setterId = formData.get("setter_id") as string;
    const closerId = formData.get("closer_id") as string;
    const appointment = {
      id: editingAppointment?.id,
      lead_id: formData.get("lead_id") as string,
      scheduled_at: formData.get("scheduled_at") as string,
      status: formData.get("status") as string,
      notes: formData.get("notes") as string,
      setter_id: setterId === "none" ? null : setterId,
      closer_id: closerId === "none" ? null : closerId,
    };
    saveMutation.mutate(appointment);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Appointments</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingAppointment(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Appointment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAppointment ? "Edit Appointment" : "Add New Appointment"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="lead_id">Lead</Label>
                <Select name="lead_id" defaultValue={editingAppointment?.lead_id} required>
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
                <Label htmlFor="scheduled_at">Scheduled Date & Time</Label>
                <Input
                  id="scheduled_at"
                  name="scheduled_at"
                  type="datetime-local"
                  defaultValue={editingAppointment?.scheduled_at?.slice(0, 16)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue={editingAppointment?.status || "scheduled"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="no_show">No Show</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="setter_id">Setter</Label>
                <Select name="setter_id" defaultValue={editingAppointment?.setter_id || "none"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a setter (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {profiles?.filter(p => p.role === "setter").map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name || profile.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="closer_id">Closer</Label>
                <Select name="closer_id" defaultValue={editingAppointment?.closer_id || "none"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a closer (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {profiles?.filter(p => p.role === "closer").map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name || profile.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" defaultValue={editingAppointment?.notes} />
              </div>
              <Button type="submit" className="w-full">
                {editingAppointment ? "Update" : "Create"} Appointment
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
              <TableHead>Scheduled</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : appointments?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">No appointments found</TableCell>
              </TableRow>
            ) : (
              appointments?.map((appointment) => (
                <TableRow key={appointment.id}>
                  <TableCell className="font-medium">{appointment.leads?.name}</TableCell>
                  <TableCell>{new Date(appointment.scheduled_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <span className="capitalize">{appointment.status.replace("_", " ")}</span>
                  </TableCell>
                  <TableCell>{appointment.notes}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingAppointment(appointment);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(appointment.id)}
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
