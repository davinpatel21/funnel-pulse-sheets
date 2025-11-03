import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSheetConfigurations } from "./useSheetConfigurations";
import { useLiveSheetMetrics } from "./useLiveSheetMetrics";

export interface DashboardFilters {
  setterId?: string;
  closerId?: string;
  source?: string;
  startDate?: Date;
  endDate?: Date;
}

export const useDashboardMetrics = (filters: DashboardFilters = {}) => {
  const { data: configs, isLoading: configsLoading } = useSheetConfigurations();
  const mode = configs && configs.length > 0 ? 'live' : 'database';
  
  // Live mode - fetch from Google Sheets
  const liveMetrics = useLiveSheetMetrics(configs || [], filters);
  
  // Database mode - fetch from Supabase
  const databaseMetrics = useQuery({
    queryKey: ["dashboardMetrics", filters],
    queryFn: async () => {
      // Build filter conditions
      let dealsQuery = supabase.from("deals").select("*");
      let leadsQuery = supabase.from("leads").select("*");
      let appointmentsQuery = supabase.from("appointments").select("*");
      let callsQuery = supabase.from("calls").select("*");

      if (filters.setterId) {
        dealsQuery = dealsQuery.eq("setter_id", filters.setterId);
        leadsQuery = leadsQuery.eq("setter_id", filters.setterId);
        appointmentsQuery = appointmentsQuery.eq("setter_id", filters.setterId);
      }

      if (filters.closerId) {
        dealsQuery = dealsQuery.eq("closer_id", filters.closerId);
        leadsQuery = leadsQuery.eq("closer_id", filters.closerId);
        appointmentsQuery = appointmentsQuery.eq("closer_id", filters.closerId);
      }

      if (filters.source) {
        leadsQuery = leadsQuery.eq("source", filters.source as any);
      }

      if (filters.startDate) {
        const startISO = filters.startDate.toISOString();
        dealsQuery = dealsQuery.gte("created_at", startISO);
        leadsQuery = leadsQuery.gte("created_at", startISO);
        appointmentsQuery = appointmentsQuery.gte("created_at", startISO);
        callsQuery = callsQuery.gte("created_at", startISO);
      }

      if (filters.endDate) {
        const endISO = filters.endDate.toISOString();
        dealsQuery = dealsQuery.lte("created_at", endISO);
        leadsQuery = leadsQuery.lte("created_at", endISO);
        appointmentsQuery = appointmentsQuery.lte("created_at", endISO);
        callsQuery = callsQuery.lte("created_at", endISO);
      }

      const [dealsResult, leadsResult, appointmentsResult, callsResult] = await Promise.all([
        dealsQuery,
        leadsQuery,
        appointmentsQuery,
        callsQuery,
      ]);

      if (dealsResult.error) throw dealsResult.error;
      if (leadsResult.error) throw leadsResult.error;
      if (appointmentsResult.error) throw appointmentsResult.error;
      if (callsResult.error) throw callsResult.error;

      const deals = dealsResult.data || [];
      const leads = leadsResult.data || [];
      const appointments = appointmentsResult.data || [];
      const calls = callsResult.data || [];

      // Calculate metrics
      const totalRevenue = deals
        .filter((d) => d.status === "won")
        .reduce((sum, d) => sum + Number(d.revenue_amount), 0);

      const totalCashCollected = deals.reduce((sum, d) => sum + Number(d.cash_collected), 0);
      
      const totalFees = deals.reduce((sum, d) => sum + Number(d.fees_amount), 0);
      
      const cashAfterFees = totalCashCollected - totalFees;

      const liveCalls = calls.filter((c) => c.was_live).length;
      const totalCalls = calls.length;
      
      const cashPerCall = totalCalls > 0 ? totalCashCollected / totalCalls : 0;

      const wonDeals = deals.filter((d) => d.status === "won");
      const avgOrderValue = wonDeals.length > 0 
        ? wonDeals.reduce((sum, d) => sum + Number(d.revenue_amount), 0) / wonDeals.length 
        : 0;

      const totalCallsBooked = appointments.length;
      
      const completedAppointments = appointments.filter((a) => 
        a.status === "completed" || a.status === "no_show"
      ).length;
      
      const noShows = appointments.filter((a) => a.status === "no_show").length;
      const shows = completedAppointments - noShows;
      
      const closeRate = completedAppointments > 0 
        ? (wonDeals.length / completedAppointments) * 100 
        : 0;
      
      const noShowRate = totalCallsBooked > 0 
        ? (noShows / totalCallsBooked) * 100 
        : 0;
      
      const showRate = totalCallsBooked > 0 
        ? (shows / totalCallsBooked) * 100 
        : 0;

      // Appointment status breakdown
      const appointmentStatusCounts = appointments.reduce((acc, apt) => {
        acc[apt.status] = (acc[apt.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Lead source breakdown
      const sourceFilteredLeads = filters.source 
        ? leads.filter((l) => l.source === filters.source)
        : leads;
        
      const leadSourceCounts = sourceFilteredLeads.reduce((acc, lead) => {
        acc[lead.source] = (acc[lead.source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalRevenue,
        totalCashCollected,
        cashAfterFees,
        cashPerCall,
        avgOrderValue,
        totalCallsBooked,
        liveCalls: liveCalls,
        totalCalls,
        closeRate,
        noShowRate,
        showRate,
        totalLeads: leads.length,
        appointmentStatusCounts,
        leadSourceCounts,
      };
    },
    enabled: mode === 'database',
  });

  // Return live or database metrics based on mode
  if (mode === 'live') {
    return {
      data: liveMetrics.data ? { ...liveMetrics.data, isLiveMode: true } : undefined,
      isLoading: liveMetrics.isLoading,
      error: liveMetrics.error,
    } as any;
  }
  
  return {
    data: databaseMetrics.data ? { ...databaseMetrics.data, isLiveMode: false } : undefined,
    isLoading: databaseMetrics.isLoading,
    error: databaseMetrics.error,
  } as any;
};
