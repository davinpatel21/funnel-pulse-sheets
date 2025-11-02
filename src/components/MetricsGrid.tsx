import { MetricCard } from "@/components/MetricCard";
import {
  DollarSign,
  TrendingUp,
  Phone,
  Target,
  Users,
  PhoneCall,
  CheckCircle,
  XCircle,
  Calendar,
} from "lucide-react";

interface MetricsGridProps {
  metrics: {
    totalRevenue: number;
    totalCashCollected: number;
    cashAfterFees: number;
    cashPerCall: number;
    avgOrderValue: number;
    totalCallsBooked: number;
    liveCalls: number;
    totalCalls: number;
    closeRate: number;
    noShowRate: number;
    showRate: number;
    totalLeads: number;
  };
  isLoading?: boolean;
}

export const MetricsGrid = ({ metrics, isLoading }: MetricsGridProps) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

  return (
    <>
      {/* Top Revenue Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <MetricCard
          title="Revenue Generated"
          value={formatCurrency(metrics.totalRevenue)}
          icon={TrendingUp}
          iconColor="text-primary"
        />
        <MetricCard
          title="Cash Collected"
          value={formatCurrency(metrics.totalCashCollected)}
          icon={DollarSign}
          iconColor="text-success"
        />
      </div>

      {/* Mid-tier Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <MetricCard
          title="Cash Collected After Fees"
          value={formatCurrency(metrics.cashAfterFees)}
          icon={DollarSign}
          iconColor="text-foreground"
        />
        <MetricCard
          title="Cash Collected Per Call Taken"
          value={formatCurrency(metrics.cashPerCall)}
          icon={PhoneCall}
          iconColor="text-foreground"
        />
        <MetricCard
          title="Average Order Value"
          value={formatCurrency(metrics.avgOrderValue)}
          icon={Target}
          iconColor="text-foreground"
        />
      </div>

      {/* Call & Activity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <MetricCard
          title="Total Calls Booked"
          value={metrics.totalCallsBooked}
          icon={Calendar}
          iconColor="text-foreground"
        />
        <MetricCard
          title="Total Live Calls"
          value={metrics.liveCalls}
          icon={Phone}
          iconColor="text-foreground"
        />
        <MetricCard
          title="Total Close Rate"
          value={`${metrics.closeRate.toFixed(2)}%`}
          icon={CheckCircle}
          iconColor="text-foreground"
        />
      </div>

      {/* Show Rate Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <MetricCard
          title="Total No Show Rate"
          value={`${metrics.noShowRate.toFixed(2)}%`}
          icon={XCircle}
          iconColor="text-destructive"
        />
        <MetricCard
          title="Show Rate"
          value={`${metrics.showRate.toFixed(2)}%`}
          icon={CheckCircle}
          iconColor="text-success"
        />
      </div>
    </>
  );
};