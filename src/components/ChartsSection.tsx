import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface ChartsSectionProps {
  appointmentStatusCounts: Record<string, number>;
  leadSourceCounts: Record<string, number>;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(var(--muted))",
];

export const ChartsSection = ({
  appointmentStatusCounts,
  leadSourceCounts,
}: ChartsSectionProps) => {
  const statusData = Object.entries(appointmentStatusCounts).map(([name, value]) => ({
    name: name.replace("_", " ").toUpperCase(),
    value,
  }));

  const sourceData = Object.entries(leadSourceCounts).map(([name, value]) => ({
    name: name.replace("_", " ").toUpperCase(),
    value,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <Card className="p-6 bg-gradient-card shadow-card hover:shadow-intense border border-border transition-all duration-500 animate-fade-in">
        <h2 className="text-xl font-bold text-foreground mb-6">Appointment Status Post Call</h2>
        {statusData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No appointment data available
          </div>
        )}
      </Card>

      <Card className="p-6 bg-gradient-card shadow-card hover:shadow-intense border border-border transition-all duration-500 animate-fade-in">
        <h2 className="text-xl font-bold text-foreground mb-6">Booked Calls Source</h2>
        {sourceData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={sourceData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {sourceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No source data available
          </div>
        )}
      </Card>
    </div>
  );
};