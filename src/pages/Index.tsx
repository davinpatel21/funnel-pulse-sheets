import { useState } from "react";
import { DashboardFilters } from "@/components/DashboardFilters";
import { MetricsGrid } from "@/components/MetricsGrid";
import { ChartsSection } from "@/components/ChartsSection";
import { LeadsTable } from "@/components/LeadsTable";
import { useDashboardMetrics, type DashboardFilters as Filters } from "@/hooks/useDashboardMetrics";
import logo from "@/assets/vantage-point-logo.png";

const Index = () => {
  const [filters, setFilters] = useState<Filters>({});
  const { data: metrics, isLoading } = useDashboardMetrics(filters);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-gradient-card shadow-elegant backdrop-blur-sm sticky top-0 z-50 animate-fade-in">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src={logo} 
                alt="Vantage Point" 
                className="h-12 w-12 transition-transform duration-300 hover:scale-110"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Vantage Point</h1>
                <p className="text-sm text-muted-foreground mt-0.5">DFY Sales Funnel Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-success/10 border border-success/20 transition-all duration-300 hover:scale-105">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-success">
                {metrics?.isLiveMode ? 'Live from Google Sheets' : 'Live Tracking'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Filters */}
        <DashboardFilters filters={filters} onFiltersChange={setFilters} />

        {/* Metrics Grid */}
        <div className="mt-8">
          {metrics && (
            <>
              <MetricsGrid metrics={metrics} isLoading={isLoading} />
              
              {/* Charts Section */}
              <ChartsSection
                appointmentStatusCounts={metrics.appointmentStatusCounts}
                leadSourceCounts={metrics.leadSourceCounts}
              />
            </>
          )}
        </div>

        {/* Recent Leads */}
        <div className="mb-8">
          <LeadsTable />
        </div>
      </main>
    </div>
  );
};

export default Index;
