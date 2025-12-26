import { useState } from "react";
import { DashboardFilters } from "@/components/DashboardFilters";
import { MetricsGrid } from "@/components/MetricsGrid";
import { ChartsSection } from "@/components/ChartsSection";
import { LeadsTable } from "@/components/LeadsTable";
import { useDashboardMetrics, type DashboardFilters as Filters } from "@/hooks/useDashboardMetrics";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [filters, setFilters] = useState<Filters>({});
  const { data: metrics, isLoading } = useDashboardMetrics(filters);
  const navigate = useNavigate();
  
  // Check for incomplete data
  const hasLeadsButNoRevenue = metrics && metrics.totalLeads > 0 && metrics.totalRevenue === 0;
  const hasAppointmentsOnly = metrics && metrics.totalCallsBooked > 0 && metrics.totalRevenue === 0;

  return (
    <div className="min-h-full bg-background">
      {/* Main Content */}
      <main className="container mx-auto px-6 py-6">
        {/* Data Completeness Alert */}
        {(hasLeadsButNoRevenue || hasAppointmentsOnly) && (
          <Alert className="mb-6 border-warning/50 bg-warning/5">
            <AlertCircle className="h-5 w-5 text-warning" />
            <AlertTitle className="text-warning font-semibold">Incomplete Data Configuration</AlertTitle>
            <AlertDescription className="text-sm mt-2">
              {hasAppointmentsOnly && (
                <div className="space-y-2">
                  <p>Your sheet contains <strong>appointment data</strong> ({metrics.totalCallsBooked} appointments), but no deals/revenue data is connected.</p>
                  <div className="flex items-center gap-2 mt-3">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      To see revenue metrics (${metrics.totalRevenue.toLocaleString()}, AOV, Close Rate), connect a Deals sheet with revenue information.
                    </span>
                  </div>
                </div>
              )}
              {hasLeadsButNoRevenue && !hasAppointmentsOnly && (
                <p>You have {metrics.totalLeads} leads but no deals/revenue data. Connect additional sheets for complete metrics.</p>
              )}
              <Button 
                variant="link" 
                className="h-auto p-0 mt-2 text-warning hover:text-warning/80" 
                onClick={() => navigate('/settings')}
              >
                Connect More Sheets →
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Filters */}
        <DashboardFilters filters={filters} onFiltersChange={setFilters} />

        {/* Metrics Grid */}
        <div className="mt-6">
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
