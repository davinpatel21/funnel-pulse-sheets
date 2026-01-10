import { useQuery } from "@tanstack/react-query";
import { invokeWithAuth } from "@/lib/authHelpers";

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
          const { data, error } = await invokeWithAuth('google-sheets-live', {
            body: { configuration_id: config.id }
          });
          
          if (error) {
            console.error(`Error fetching sheet ${config.id}:`, error);
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
  // REVENUE METRICS (from deals or from appointment custom_fields if deals embedded)
  const dealsData = deals.length > 0 ? deals : 
    appointments.filter(a => a.revenue_amount || a.custom_fields?.revenue);
  
  const totalRevenue = dealsData.reduce((sum, d) => {
    const revenue = d.revenue_amount || parseFloat(d.custom_fields?.revenue?.replace(/[$,]/g, '') || '0');
    return sum + revenue;
  }, 0);
  
  const totalCashCollected = dealsData.reduce((sum, d) => {
    const cash = d.cash_collected || parseFloat(d.custom_fields?.cashCollected?.replace(/[$,]/g, '') || '0');
    return sum + cash;
  }, 0);
  
  const totalFees = dealsData.reduce((sum, d) => d.fees_amount || 0, 0);
  const cashAfterFees = totalCashCollected - totalFees;
  
  // APPOINTMENT METRICS
  const totalAppointmentsBooked = appointments.length;
  
  // Status breakdown - check both status field and custom_fields.callStatus
  const getCallStatus = (appt: any) => {
    const status = appt.custom_fields?.callStatus || appt.status || '';
    return status.toLowerCase().trim();
  };
  
  const closedAppts = appointments.filter(a => {
    const status = getCallStatus(a);
    return status === 'closed' || status.includes('won') || a.created_deal === true;
  });
  
  const noShows = appointments.filter(a => {
    const status = getCallStatus(a);
    return status.includes('no show') || status === 'no_show' || status === 'dns';
  }).length;
  
  const shows = appointments.filter(a => {
    const status = getCallStatus(a);
    return a.status === 'completed' || status === 'closed' || status === 'no close' || status.includes('qualified');
  }).length;
  
  // RATE CALCULATIONS
  const showRate = totalAppointmentsBooked > 0 ? (shows / totalAppointmentsBooked) * 100 : 0;
  const noShowRate = totalAppointmentsBooked > 0 ? (noShows / totalAppointmentsBooked) * 100 : 0;
  const closeRate = shows > 0 ? (closedAppts.length / shows) * 100 : 0;
  
  // DEAL METRICS
  const totalDeals = closedAppts.length;
  const avgDealSize = totalDeals > 0 ? totalRevenue / totalDeals : 0;
  
  // CALL METRICS
  const totalCalls = calls.length || shows; // Use shows if no separate calls table
  const liveCalls = calls.filter((c) => c.was_live).length || shows;
  const cashPerBookedCall = totalAppointmentsBooked > 0 ? totalCashCollected / totalAppointmentsBooked : 0;
  
  // PAYMENT PROCESSOR FEE TRACKING
  const processorFeePercentage = totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0;
  
  // SOURCE PERFORMANCE
  const sourcePerformance: Record<string, any> = {};
  appointments.forEach(a => {
    const source = a.custom_fields?.utmSource || a.utm_source || 'unknown';
    if (!sourcePerformance[source]) {
      sourcePerformance[source] = { appts: 0, revenue: 0, deals: 0 };
    }
    sourcePerformance[source].appts++;
    if (a.created_deal || closedAppts.includes(a)) {
      sourcePerformance[source].deals++;
      const rev = a.revenue_amount || parseFloat(a.custom_fields?.revenue?.replace(/[$,]/g, '') || '0');
      sourcePerformance[source].revenue += rev;
    }
  });
  
  // CLOSER PERFORMANCE
  const closerPerformance: Record<string, any> = {};
  appointments.forEach(a => {
    const closer = a.custom_fields?.closerName || a.pipeline || 'Unassigned';
    if (!closerPerformance[closer]) {
      closerPerformance[closer] = { appts: 0, shows: 0, noShows: 0, deals: 0, revenue: 0 };
    }
    closerPerformance[closer].appts++;
    
    const status = getCallStatus(a);
    if (status.includes('no show') || a.status === 'no_show') {
      closerPerformance[closer].noShows++;
    } else if (a.status === 'completed') {
      closerPerformance[closer].shows++;
    }
    
    if (a.created_deal || closedAppts.includes(a)) {
      closerPerformance[closer].deals++;
      const rev = a.revenue_amount || parseFloat(a.custom_fields?.revenue?.replace(/[$,]/g, '') || '0');
      closerPerformance[closer].revenue += rev;
    }
  });
  
  // SETTER PERFORMANCE
  const setterPerformance: Record<string, any> = {};
  appointments.forEach(a => {
    const setter = a.custom_fields?.setterName || a.custom_fields?.setBy || 'Unassigned';
    if (!setterPerformance[setter]) {
      setterPerformance[setter] = { appts: 0, shows: 0, deals: 0, revenue: 0 };
    }
    setterPerformance[setter].appts++;
    
    if (a.status === 'completed') {
      setterPerformance[setter].shows++;
    }
    
    if (a.created_deal || closedAppts.includes(a)) {
      setterPerformance[setter].deals++;
      const rev = a.revenue_amount || parseFloat(a.custom_fields?.revenue?.replace(/[$,]/g, '') || '0');
      setterPerformance[setter].revenue += rev;
    }
  });
  
  // PAYMENT PLATFORM BREAKDOWN
  const paymentPlatforms: Record<string, number> = {};
  dealsData.forEach(d => {
    const platform = d.payment_platform || d.custom_fields?.paymentPlatform || 'Unknown';
    paymentPlatforms[platform] = (paymentPlatforms[platform] || 0) + 1;
  });
  
  // TIME METRICS
  const appointmentsWithDates = appointments.filter(a => a.booked_at && a.scheduled_at);
  const avgDaysToBook = appointmentsWithDates.length > 0
    ? appointmentsWithDates.reduce((sum, a) => {
        const bookedTime = new Date(a.booked_at).getTime();
        const scheduledTime = new Date(a.scheduled_at).getTime();
        const days = (scheduledTime - bookedTime) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0) / appointmentsWithDates.length
    : 0;

  // FIX APPOINTMENT STATUS COUNTS - Use Call Status values from sheet
  const appointmentStatusCounts: Record<string, number> = {};
  appointments.forEach(a => {
    const callStatus = getCallStatus(a);
    let displayStatus = 'Other';
    
    if (callStatus === 'closed' || callStatus.includes('won') || a.created_deal) {
      displayStatus = 'Closed';
    } else if (callStatus.includes('no show') || callStatus === 'no_show') {
      displayStatus = 'No Show';
    } else if (callStatus === 'no close' || callStatus.includes('no close')) {
      displayStatus = 'No Close';
    } else if (callStatus === 'scheduled' || a.status === 'scheduled') {
      displayStatus = 'Scheduled';
    }
    
    appointmentStatusCounts[displayStatus] = (appointmentStatusCounts[displayStatus] || 0) + 1;
  });
  
  // FIX LEAD SOURCE COUNTS - Use UTM Source from appointments
  const leadSourceCounts: Record<string, number> = {};
  appointments.forEach(a => {
    const source = a.custom_fields?.utmSource || a.utm_source || 'Unknown';
    leadSourceCounts[source] = (leadSourceCounts[source] || 0) + 1;
  });

  return {
    totalRevenue,
    totalCashCollected,
    cashAfterFees,
    cashPerBookedCall,
    avgDealSize,
    totalAppointmentsBooked,
    totalDeals,
    shows,
    noShows,
    liveCalls,
    totalCalls,
    closeRate,
    noShowRate,
    showRate,
    processorFeePercentage,
    avgDaysToBook,
    totalLeads: leads.length,
    sourcePerformance,
    closerPerformance,
    setterPerformance,
    paymentPlatforms,
    appointmentStatusCounts,
    leadSourceCounts,
  };
}

function getEmptyMetrics() {
  return {
    totalRevenue: 0,
    totalCashCollected: 0,
    cashAfterFees: 0,
    cashPerBookedCall: 0,
    avgDealSize: 0,
    totalAppointmentsBooked: 0,
    totalDeals: 0,
    shows: 0,
    noShows: 0,
    liveCalls: 0,
    totalCalls: 0,
    closeRate: 0,
    noShowRate: 0,
    showRate: 0,
    processorFeePercentage: 0,
    avgDaysToBook: 0,
    totalLeads: 0,
    sourcePerformance: {},
    closerPerformance: {},
    setterPerformance: {},
    paymentPlatforms: {},
    appointmentStatusCounts: {},
    leadSourceCounts: {},
  };
}
