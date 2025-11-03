import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DashboardFilters {
  setterId?: string;
  closerId?: string;
  source?: string;
  startDate?: Date;
  endDate?: Date;
}

export function useLiveSheetMetrics(configs: any[], filters: DashboardFilters = {}) {
  return useQuery({
    queryKey: ['live-metrics', configs.map(c => c.id), filters],
    queryFn: async () => {
      if (!configs || configs.length === 0) {
        return getEmptyMetrics();
      }

      // Fetch data from each configured sheet
      const results = await Promise.all(
        configs.map(async (config) => {
          const { data, error } = await supabase.functions.invoke('google-sheets-live', {
            body: { configuration_id: config.id }
          });
          
          if (error) {
            console.error(`Error fetching sheet ${config.id}:`, error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            return { sheet_type: config.sheet_type, data: [], error: error.message || 'Unknown error' };
          }
          
          if (!data) {
            console.warn(`No data returned for sheet ${config.id}`);
            return { sheet_type: config.sheet_type, data: [] };
          }
          
          return { sheet_type: data.sheet_type, data: data.data || [] };
        })
      );

      // Organize data by type
      const leads = results.find(r => r.sheet_type === 'leads')?.data || [];
      const appointments = results.find(r => r.sheet_type === 'appointments')?.data || [];
      const deals = results.find(r => r.sheet_type === 'deals')?.data || [];
      const calls = results.find(r => r.sheet_type === 'calls')?.data || [];

      // Apply filters
      const filteredLeads = applyFilters(leads, filters);
      const filteredAppointments = applyFilters(appointments, filters);
      const filteredDeals = applyFilters(deals, filters);
      const filteredCalls = applyFilters(calls, filters);

      // Calculate metrics (same logic as useDashboardMetrics)
      return calculateMetrics(filteredLeads, filteredAppointments, filteredDeals, filteredCalls);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    enabled: configs && configs.length > 0,
  });
}

function applyFilters(data: any[], filters: DashboardFilters) {
  return data.filter(item => {
    if (filters.setterId && item.setter_id !== filters.setterId) return false;
    if (filters.closerId && item.closer_id !== filters.closerId) return false;
    if (filters.source && item.source !== filters.source) return false;
    if (filters.startDate) {
      const startISO = filters.startDate.toISOString();
      if (item.created_at < startISO) return false;
    }
    if (filters.endDate) {
      const endISO = filters.endDate.toISOString();
      if (item.created_at > endISO) return false;
    }
    return true;
  });
}

function calculateMetrics(leads: any[], appointments: any[], deals: any[], calls: any[]) {
  const totalRevenue = deals
    .filter((d) => d.status === "won")
    .reduce((sum, deal) => sum + (Number(deal.revenue_amount) || 0), 0);
  
  const totalCashCollected = deals.reduce((sum, deal) => sum + (Number(deal.cash_collected) || 0), 0);
  const totalFees = deals.reduce((sum, deal) => sum + (Number(deal.fees_amount) || 0), 0);
  const cashAfterFees = totalCashCollected - totalFees;
  
  const totalCalls = calls.length;
  const liveCalls = calls.filter((c) => c.was_live).length;
  const cashPerCall = totalCalls > 0 ? totalCashCollected / totalCalls : 0;
  
  const wonDeals = deals.filter((d) => d.status === "won");
  const avgOrderValue = wonDeals.length > 0 
    ? wonDeals.reduce((sum, d) => sum + Number(d.revenue_amount), 0) / wonDeals.length 
    : 0;

  const totalCallsBooked = appointments.length;
  const completedAppts = appointments.filter(a => a.status === 'completed' || a.status === 'no_show').length;
  const noShows = appointments.filter(a => a.status === 'no_show').length;
  const shows = completedAppts - noShows;
  
  const closeRate = completedAppts > 0 ? (wonDeals.length / completedAppts) * 100 : 0;
  const noShowRate = totalCallsBooked > 0 ? (noShows / totalCallsBooked) * 100 : 0;
  const showRate = totalCallsBooked > 0 ? (shows / totalCallsBooked) * 100 : 0;

  const appointmentStatusCounts = appointments.reduce((acc, apt) => {
    acc[apt.status] = (acc[apt.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const leadSourceCounts = leads.reduce((acc, lead) => {
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
    liveCalls,
    totalCalls,
    closeRate,
    noShowRate,
    showRate,
    totalLeads: leads.length,
    appointmentStatusCounts,
    leadSourceCounts,
  };
}

function getEmptyMetrics() {
  return {
    totalRevenue: 0,
    totalCashCollected: 0,
    cashAfterFees: 0,
    cashPerCall: 0,
    avgOrderValue: 0,
    totalCallsBooked: 0,
    liveCalls: 0,
    totalCalls: 0,
    closeRate: 0,
    noShowRate: 0,
    showRate: 0,
    totalLeads: 0,
    appointmentStatusCounts: {},
    leadSourceCounts: {},
  };
}
