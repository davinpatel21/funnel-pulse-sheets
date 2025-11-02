import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Plus, Trash2, Key } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Settings() {
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: apiKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("api_keys").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: webhooks } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("webhook_configs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async (keyName: string) => {
      const apiKey = `vp_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const { data, error } = await supabase.from("api_keys").insert([{
        user_id: user.id,
        key_name: keyName,
        api_key: apiKey,
      }]).select().single();
      
      if (error) throw error;
      return { ...data, api_key: apiKey };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewApiKey(data.api_key);
      toast({ title: "API key created" });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key deleted" });
    },
  });

  const createWebhookMutation = useMutation({
    mutationFn: async ({ url, eventType }: { url: string; eventType: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const { error } = await supabase.from("webhook_configs").insert([{
        user_id: user.id,
        webhook_url: url,
        event_type: eventType,
      }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setIsWebhookDialogOpen(false);
      toast({ title: "Webhook configured" });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast({ title: "Webhook deleted" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Manage API keys for external integrations. Use these keys to authenticate API requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={isApiKeyDialogOpen} onOpenChange={setIsApiKeyDialogOpen}>
            <DialogTrigger asChild>
              <Button className="mb-4">
                <Plus className="h-4 w-4 mr-2" />
                Generate API Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate New API Key</DialogTitle>
              </DialogHeader>
              {newApiKey ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Save this API key securely. You won't be able to see it again.
                  </p>
                  <div className="flex items-center space-x-2">
                    <Input value={newApiKey} readOnly />
                    <Button size="sm" onClick={() => copyToClipboard(newApiKey)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button onClick={() => { setNewApiKey(null); setIsApiKeyDialogOpen(false); }} className="w-full">
                    Close
                  </Button>
                </div>
              ) : (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  createApiKeyMutation.mutate(formData.get("key_name") as string);
                }} className="space-y-4">
                  <div>
                    <Label htmlFor="key_name">Key Name</Label>
                    <Input id="key_name" name="key_name" placeholder="Production API Key" required />
                  </div>
                  <Button type="submit" className="w-full">
                    Generate
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys?.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.key_name}</TableCell>
                  <TableCell className="font-mono">
                    {key.api_key.substring(0, 12)}...
                  </TableCell>
                  <TableCell>{new Date(key.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteApiKeyMutation.mutate(key.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            Configure webhooks to send data to external services like Zapier when events occur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={isWebhookDialogOpen} onOpenChange={setIsWebhookDialogOpen}>
            <DialogTrigger asChild>
              <Button className="mb-4">
                <Plus className="h-4 w-4 mr-2" />
                Add Webhook
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure Webhook</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                createWebhookMutation.mutate({
                  url: formData.get("webhook_url") as string,
                  eventType: formData.get("event_type") as string,
                });
              }} className="space-y-4">
                <div>
                  <Label htmlFor="webhook_url">Webhook URL</Label>
                  <Input id="webhook_url" name="webhook_url" placeholder="https://hooks.zapier.com/..." required />
                </div>
                <div>
                  <Label htmlFor="event_type">Event Type</Label>
                  <select name="event_type" className="w-full border rounded p-2" required>
                    <option value="new_lead">New Lead</option>
                    <option value="updated_lead">Updated Lead</option>
                    <option value="new_appointment">New Appointment</option>
                    <option value="new_deal">New Deal</option>
                    <option value="updated_deal">Updated Deal</option>
                  </select>
                </div>
                <Button type="submit" className="w-full">
                  Add Webhook
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks?.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-mono text-sm">{webhook.webhook_url.substring(0, 40)}...</TableCell>
                  <TableCell className="capitalize">{webhook.event_type.replace("_", " ")}</TableCell>
                  <TableCell>{webhook.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteWebhookMutation.mutate(webhook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
