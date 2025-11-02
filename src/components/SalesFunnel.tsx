import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";

interface FunnelStage {
  name: string;
  count: number;
  value: string;
  percentage: number;
}

const stages: FunnelStage[] = [
  { name: "Total Leads", count: 1000, value: "$0", percentage: 100 },
  { name: "Qualified Leads", count: 500, value: "$0", percentage: 50 },
  { name: "Consultation Booked", count: 250, value: "$250k", percentage: 25 },
  { name: "Proposal Sent", count: 150, value: "$450k", percentage: 15 },
  { name: "Closed Won", count: 50, value: "$500k", percentage: 5 },
];

export const SalesFunnel = () => {
  return (
    <Card className="p-6 bg-gradient-card shadow-card border border-border">
      <h2 className="text-xl font-bold text-foreground mb-6">Sales Funnel</h2>
      <div className="space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.name} className="relative">
            <div 
              className="rounded-lg p-4 transition-all duration-300 hover:scale-[1.02]"
              style={{
                width: `${stage.percentage}%`,
                minWidth: '300px',
                background: `linear-gradient(135deg, 
                  hsl(217 91% ${35 + index * 5}%), 
                  hsl(217 91% ${45 + index * 5}%))`
              }}
            >
              <div className="flex items-center justify-between text-white">
                <div>
                  <p className="font-semibold">{stage.name}</p>
                  <p className="text-sm opacity-90">{stage.count} leads • {stage.value}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{stage.percentage}%</p>
                </div>
              </div>
            </div>
            {index < stages.length - 1 && (
              <div className="flex justify-center my-1">
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
