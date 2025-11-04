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
    cashPerBookedCall: number;
    avgDealSize: number;
    totalAppointmentsBooked: number;
    totalDeals: number;
    shows: number;
    noShows: number;
    liveCalls: number;
    totalCalls: number;
    closeRate: number;
    noShowRate: number;
    showRate: number;
    totalLeads: number;
    processorFeePercentage: number;
  };
  isLoading?: boolean;
}

export const MetricsGrid = ({ metrics, isLoading }: MetricsGridProps) => {
  if (isLoading || !metrics) {
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
  
  // Safe defaults for all metrics
  const safeMetrics = {
    totalRevenue: metrics.totalRevenue ?? 0,
    totalCashCollected: metrics.totalCashCollected ?? 0,
    cashAfterFees: metrics.cashAfterFees ?? 0,
    cashPerBookedCall: metrics.cashPerBookedCall ?? 0,
    avgDealSize: metrics.avgDealSize ?? 0,
    totalAppointmentsBooked: metrics.totalAppointmentsBooked ?? 0,
    totalDeals: metrics.totalDeals ?? 0,
    shows: metrics.shows ?? 0,
    noShows: metrics.noShows ?? 0,
    liveCalls: metrics.liveCalls ?? 0,
    totalCalls: metrics.totalCalls ?? 0,
    closeRate: metrics.closeRate ?? 0,
    noShowRate: metrics.noShowRate ?? 0,
    showRate: metrics.showRate ?? 0,
    totalLeads: metrics.totalLeads ?? 0,
    processorFeePercentage: metrics.processorFeePercentage ?? 0,
  };

  return (
    <>
      {/* Top Revenue Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <MetricCard
          title="Revenue Generated"
          value={formatCurrency(safeMetrics.totalRevenue)}
          icon={TrendingUp}
          iconColor="text-primary"
        />
        <MetricCard
          title="Cash Collected"
          value={formatCurrency(safeMetrics.totalCashCollected)}
          icon={DollarSign}
          iconColor="text-success"
        />
      </div>

      {/* Mid-tier Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <MetricCard
          title="Total Deals Closed"
          value={safeMetrics.totalDeals}
          icon={CheckCircle}
          iconColor="text-success"
        />
        <MetricCard
          title="Average Deal Size"
          value={formatCurrency(safeMetrics.avgDealSize)}
          icon={Target}
          iconColor="text-foreground"
        />
        <MetricCard
          title="Cash Per Booked Call"
          value={formatCurrency(safeMetrics.cashPerBookedCall)}
          icon={PhoneCall}
          iconColor="text-foreground"
        />
      </div>

      {/* Call & Activity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <MetricCard
          title="Appointments Booked"
          value={safeMetrics.totalAppointmentsBooked}
          icon={Calendar}
          iconColor="text-foreground"
        />
        <MetricCard
          title="Shows"
          value={safeMetrics.shows}
          icon={CheckCircle}
          iconColor="text-success"
        />
        <MetricCard
          title="No Shows"
          value={safeMetrics.noShows}
          icon={XCircle}
          iconColor="text-destructive"
        />
        <MetricCard
          title="Close Rate"
          value={`${safeMetrics.closeRate.toFixed(1)}%`}
          icon={Target}
          iconColor="text-foreground"
        />
      </div>

      {/* Show Rate Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <MetricCard
          title="Show Rate"
          value={`${safeMetrics.showRate.toFixed(1)}%`}
          icon={CheckCircle}
          iconColor="text-success"
        />
        <MetricCard
          title="No Show Rate"
          value={`${safeMetrics.noShowRate.toFixed(1)}%`}
          icon={XCircle}
          iconColor="text-destructive"
        />
        <MetricCard
          title="Payment Processor Fees"
          value={`${safeMetrics.processorFeePercentage.toFixed(1)}%`}
          icon={DollarSign}
          iconColor="text-warning"
        />
      </div>
    </>
  );
};