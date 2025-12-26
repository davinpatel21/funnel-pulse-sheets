import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, ArrowRight } from "lucide-react";

interface SheetsNotConnectedProps {
  entityName: string;
}

export function SheetsNotConnected({ entityName }: SheetsNotConnectedProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
      
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse delay-700" />
      </div>
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md px-6">
        {/* Icon with glow effect */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl scale-150" />
          <div className="relative bg-card border-2 border-border rounded-2xl p-6 shadow-[var(--shadow-intense)]">
            <FileSpreadsheet className="h-16 w-16 text-primary" />
          </div>
        </div>
        
        {/* Text */}
        <h2 className="text-3xl font-bold tracking-tight mb-3">
          Connect Google Sheets
        </h2>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          Connect your Google Sheets account to view and manage your {entityName} data. 
          All data is synced directly from your spreadsheet.
        </p>
        
        {/* CTA Button */}
        <Link to="/settings">
          <Button size="lg" className="gap-2 text-base px-8 py-6 shadow-[var(--shadow-elegant)] hover:shadow-[var(--shadow-intense)] transition-all duration-300">
            <FileSpreadsheet className="h-5 w-5" />
            Go to Settings
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
