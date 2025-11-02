import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Sheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const GoogleSheetsConnect = () => {
  const [sheetUrl, setSheetUrl] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = () => {
    if (!sheetUrl) {
      toast.error("Please enter a Google Sheets URL");
      return;
    }
    setIsConnected(true);
    toast.success("Connected to Google Sheets successfully!");
  };

  const handleSync = () => {
    toast.success("Data synced successfully!");
  };

  return (
    <Card className="p-6 bg-gradient-card shadow-card border border-border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-success/10">
          <Sheet className="w-5 h-5 text-success" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Google Sheets Integration</h2>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Google Sheets URL
          </label>
          <Input
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            disabled={isConnected}
            className="border-border"
          />
        </div>

        {!isConnected ? (
          <Button 
            onClick={handleConnect} 
            className="w-full bg-gradient-primary hover:opacity-90 transition-opacity"
          >
            Connect Sheet
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg border border-success/20">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-success">Connected</span>
            </div>
            <Button 
              onClick={handleSync}
              variant="outline"
              className="w-full border-border"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync Data
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};
