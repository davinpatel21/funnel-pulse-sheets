import { MetricCard } from "@/components/MetricCard";
import { SalesFunnel } from "@/components/SalesFunnel";
import { GoogleSheetsConnect } from "@/components/GoogleSheetsConnect";
import { LeadsTable } from "@/components/LeadsTable";
import { Users, DollarSign, TrendingUp, Target } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Sales Funnel Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">High Ticket Sales Performance</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-success">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total Leads"
            value="1,000"
            change="+12.5% from last month"
            changeType="positive"
            icon={Users}
            iconColor="text-primary"
          />
          <MetricCard
            title="Total Revenue"
            value="$500K"
            change="+18.2% from last month"
            changeType="positive"
            icon={DollarSign}
            iconColor="text-success"
          />
          <MetricCard
            title="Conversion Rate"
            value="5%"
            change="+2.1% from last month"
            changeType="positive"
            icon={TrendingUp}
            iconColor="text-accent"
          />
          <MetricCard
            title="Avg Deal Size"
            value="$10K"
            change="+5.3% from last month"
            changeType="positive"
            icon={Target}
            iconColor="text-warning"
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <SalesFunnel />
          </div>
          <div>
            <GoogleSheetsConnect />
          </div>
        </div>

        {/* Leads Table */}
        <LeadsTable />
      </main>
    </div>
  );
};

export default Index;
