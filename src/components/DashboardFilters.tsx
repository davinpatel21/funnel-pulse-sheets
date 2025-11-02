import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardFilters as Filters } from "@/hooks/useDashboardMetrics";

interface DashboardFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export const DashboardFilters = ({ filters, onFiltersChange }: DashboardFiltersProps) => {
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name: string | null; role: string }>>([]);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  useEffect(() => {
    const fetchProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .order("full_name");
      if (data) setProfiles(data);
    };
    fetchProfiles();
  }, []);

  const setters = profiles.filter((p) => p.role === "setter");
  const closers = profiles.filter((p) => p.role === "closer");

  const sources = [
    "youtube", "instagram", "discord", "email",  
    "vendor_doc", "sms", "facebook", "tiktok", "referral", "other"
  ];

  const handleReset = () => {
    onFiltersChange({});
    setDateRange({});
  };

  const handleDateSelect = (range: { from?: Date; to?: Date }) => {
    setDateRange(range);
    onFiltersChange({
      ...filters,
      startDate: range.from,
      endDate: range.to,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-gradient-card border border-border rounded-lg shadow-card animate-fade-in">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Filters:</span>
      </div>

      <Select
        value={filters.setterId || "all"}
        onValueChange={(value) =>
          onFiltersChange({ ...filters, setterId: value === "all" ? undefined : value })
        }
      >
        <SelectTrigger className="w-[180px] border-border">
          <SelectValue placeholder="All Setters" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Setters</SelectItem>
          {setters.map((setter) => (
            <SelectItem key={setter.id} value={setter.id}>
              {setter.full_name || "Unnamed"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.closerId || "all"}
        onValueChange={(value) =>
          onFiltersChange({ ...filters, closerId: value === "all" ? undefined : value })
        }
      >
        <SelectTrigger className="w-[180px] border-border">
          <SelectValue placeholder="All Closers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Closers</SelectItem>
          {closers.map((closer) => (
            <SelectItem key={closer.id} value={closer.id}>
              {closer.full_name || "Unnamed"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.source || "all"}
        onValueChange={(value) =>
          onFiltersChange({ ...filters, source: value === "all" ? undefined : value })
        }
      >
        <SelectTrigger className="w-[180px] border-border">
          <SelectValue placeholder="All Sources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sources</SelectItem>
          {sources.map((source) => (
            <SelectItem key={source} value={source}>
              {source.replace("_", " ").toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[240px] justify-start text-left font-normal border-border">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                </>
              ) : (
                format(dateRange.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            selected={{ from: dateRange.from, to: dateRange.to }}
            onSelect={(range) => handleDateSelect(range as { from?: Date; to?: Date })}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {(filters.setterId || filters.closerId || filters.source || filters.startDate) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <X className="w-4 h-4 mr-1" />
          Reset
        </Button>
      )}
    </div>
  );
};