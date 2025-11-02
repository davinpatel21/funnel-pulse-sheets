import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
}

export const MetricCard = ({ 
  title, 
  value, 
  change, 
  changeType = "neutral", 
  icon: Icon,
  iconColor = "text-primary"
}: MetricCardProps) => {
  const changeColors = {
    positive: "text-success",
    negative: "text-destructive",
    neutral: "text-muted-foreground"
  };

  return (
    <Card className="group p-6 bg-gradient-card shadow-card hover:shadow-intense transition-all duration-500 ease-smooth border border-border hover:border-foreground/20 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-2 transition-colors duration-300">{title}</p>
          <h3 className="text-3xl font-bold text-foreground mb-1 transition-transform duration-300 group-hover:scale-105">{value}</h3>
          {change && (
            <p className={`text-sm font-medium ${changeColors[changeType]} transition-all duration-300`}>
              {change}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-foreground/5 ${iconColor} transition-all duration-300 group-hover:bg-foreground/10 group-hover:scale-110`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </Card>
  );
};
