import { useQuery } from "@tanstack/react-query";
import { invokeWithAuth } from "@/lib/authHelpers";
import { debugLog, debugError, createTimedOperation } from "@/lib/debugLogger";

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

      const timer = createTimedOperation('useLiveSheetMetrics', `fetch ${configs.length} sheets`);
      debugLog('useLiveSheetMetrics', `Fetching metrics for ${configs.length} sheets`, {
        sheetIds: configs.map(c => c.id),
        sheetTypes: configs.map(c => c.sheet_type),
      });

      // Fetch data from each configured sheet
      const results = await Promise.all(
        configs.map(async (config) => {
          const sheetTimer = createTimedOperation('useLiveSheetMetrics', `sheet ${config.sheet_type}`);
          
          const { data, error } = await invokeWithAuth('google-sheets-live', {
            body: { configuration_id: config.id }
          });
          
          if (error) {
            debugError('useLiveSheetMetrics', `Error fetching sheet ${config.id}`, error, {
              configId: config.id,
              sheetType: config.sheet_type,
              requestId: (error as any).requestId,
            });
            return { sheet_type: config.sheet_type, data: [], error: error.message || 'Unknown error' };
          }
          
          if (!data) {
            debugLog('useLiveSheetMetrics', `No data returned for sheet ${config.id}`, { sheetType: config.sheet_type });
            return { sheet_type: config.sheet_type, data: [] };
          }
          
          sheetTimer.success(`Got ${data.data?.length || 0} rows`, { sheetType: data.sheet_type });
          return { sheet_type: data.sheet_type, data: data.data || [] };
        })
      );

      timer.success(`Fetched all sheets`, {
        resultCounts: results.map(r => ({ type: r.sheet_type, count: r.data.length })),
      });

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
  // REVENUE METRICS (from deals)
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
  
  // COMBINED APPOINTMENTS - Use appointments OR deals if no appointments sheet
  // When Post Call sheet is typed as 'deals', use it for both revenue AND call/status tracking
  const callRecords = appointments.length > 0 ? appointments : deals;
  const totalAppointmentsBooked = callRecords.length;
  
  // Status breakdown - check call_status, deal_status, status, and custom_fields
  const getCallStatus = (record: any) => {
    const status = record.call_status || record.deal_status || record.custom_fields?.callStatus || record.status || '';
    return String(status).toLowerCase().trim();
  };
  
  // Count closed deals (Closed status or has revenue)
  const closedRecords = callRecords.filter(r => {
    const status = getCallStatus(r);
    return status === 'closed' || status.includes('won') || 
           (r.revenue_amount && r.revenue_amount > 0) || r.created_deal === true;
  });
  
  // No Shows
  const noShowRecords = callRecords.filter(r => {
    const status = getCallStatus(r);
    return status.includes('no show') || status === 'no_show' || status === 'dns' || status === 'noshow';
  });
  const noShows = noShowRecords.length;
  
  // Shows = attended calls (Closed + No Close + other attended statuses)
  const showRecords = callRecords.filter(r => {
    const status = getCallStatus(r);
    // "Shows" are calls that were attended (not no-shows, not scheduled/pending)
    return status === 'closed' || status === 'no close' || status === 'noclose' ||
           status.includes('qualified') || status === 'completed' ||
           (r.revenue_amount && r.revenue_amount > 0);
  });
  const shows = showRecords.length;
  
  // RATE CALCULATIONS
  const showRate = totalAppointmentsBooked > 0 ? (shows / totalAppointmentsBooked) * 100 : 0;
  const noShowRate = totalAppointmentsBooked > 0 ? (noShows / totalAppointmentsBooked) * 100 : 0;
  const closeRate = shows > 0 ? (closedRecords.length / shows) * 100 : 0;
  
  // DEAL METRICS - use deals data directly for count
  const totalDeals = closedRecords.length;
  const avgDealSize = totalDeals > 0 ? totalRevenue / totalDeals : 0;
  
  // CALL METRICS
  const totalCalls = calls.length || shows; // Use shows if no separate calls table
  const liveCalls = calls.filter((c) => c.was_live).length || shows;
  const cashPerBookedCall = totalAppointmentsBooked > 0 ? totalCashCollected / totalAppointmentsBooked : 0;
  
  // PAYMENT PROCESSOR FEE TRACKING
  const processorFeePercentage = totalRevenue > 0 ? (totalFees / totalRevenue) * 100 : 0;
  
  // SOURCE PERFORMANCE - use combined call records
  const sourcePerformance: Record<string, any> = {};
  callRecords.forEach(r => {
    const source = r.custom_fields?.utmSource || r.utm_source || r.source || 'unknown';
    if (!sourcePerformance[source]) {
      sourcePerformance[source] = { appts: 0, revenue: 0, deals: 0 };
    }
    sourcePerformance[source].appts++;
    if (closedRecords.includes(r)) {
      sourcePerformance[source].deals++;
      const rev = r.revenue_amount || parseFloat(r.custom_fields?.revenue?.replace(/[$,]/g, '') || '0');
      sourcePerformance[source].revenue += rev;
    }
  });
  
  // CLOSER PERFORMANCE - use combined call records
  const closerPerformance: Record<string, any> = {};
  callRecords.forEach(r => {
    const closer = r.closer_name || r.custom_fields?.closerName || r.pipeline || 'Unassigned';
    if (!closerPerformance[closer]) {
      closerPerformance[closer] = { appts: 0, shows: 0, noShows: 0, deals: 0, revenue: 0 };
    }
    closerPerformance[closer].appts++;
    
    if (noShowRecords.includes(r)) {
      closerPerformance[closer].noShows++;
    } else if (showRecords.includes(r)) {
      closerPerformance[closer].shows++;
    }
    
    if (closedRecords.includes(r)) {
      closerPerformance[closer].deals++;
      const rev = r.revenue_amount || parseFloat(r.custom_fields?.revenue?.replace(/[$,]/g, '') || '0');
      closerPerformance[closer].revenue += rev;
    }
  });
  
  // SETTER PERFORMANCE - use combined call records
  const setterPerformance: Record<string, any> = {};
  callRecords.forEach(r => {
    const setter = r.setter_name || r.custom_fields?.setterName || r.custom_fields?.setBy || 'Unassigned';
    if (!setterPerformance[setter]) {
      setterPerformance[setter] = { appts: 0, shows: 0, deals: 0, revenue: 0 };
    }
    setterPerformance[setter].appts++;
    
    if (showRecords.includes(r)) {
      setterPerformance[setter].shows++;
    }
    
    if (closedRecords.includes(r)) {
      setterPerformance[setter].deals++;
      const rev = r.revenue_amount || parseFloat(r.custom_fields?.revenue?.replace(/[$,]/g, '') || '0');
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
  const recordsWithDates = callRecords.filter(r => r.booked_at && r.scheduled_at);
  const avgDaysToBook = recordsWithDates.length > 0
    ? recordsWithDates.reduce((sum, r) => {
        const bookedTime = new Date(r.booked_at).getTime();
        const scheduledTime = new Date(r.scheduled_at).getTime();
        const days = (scheduledTime - bookedTime) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0) / recordsWithDates.length
    : 0;

  // APPOINTMENT STATUS COUNTS - Use call status from combined records
  const appointmentStatusCounts: Record<string, number> = {};
  callRecords.forEach(r => {
    const status = getCallStatus(r);
    let displayStatus = 'Other';
    
    if (status === 'closed' || status.includes('won') || (r.revenue_amount && r.revenue_amount > 0)) {
      displayStatus = 'Closed';
    } else if (status.includes('no show') || status === 'no_show' || status === 'noshow') {
      displayStatus = 'No Show';
    } else if (status === 'no close' || status.includes('no close') || status === 'noclose') {
      displayStatus = 'No Close';
    } else if (status === 'scheduled') {
      displayStatus = 'Scheduled';
    }
    
    appointmentStatusCounts[displayStatus] = (appointmentStatusCounts[displayStatus] || 0) + 1;
  });
  
  // LEAD SOURCE COUNTS - Use UTM Source from combined records
  const leadSourceCounts: Record<string, number> = {};
  callRecords.forEach(r => {
    const source = r.custom_fields?.utmSource || r.utm_source || r.source || 'Unknown';
    leadSourceCounts[source] = (leadSourceCounts[source] || 0) + 1;
  });

  // FORM COMPLIANCE METRICS - use combined call records
  // Setter form compliance (for all records with a setter)
  const recordsWithSetter = callRecords.filter(r => 
    r.setter_name || r.custom_fields?.setterName || r.custom_fields?.setBy
  );
  const setterFormsFilled = recordsWithSetter.filter(r => 
    r.post_set_form_filled || r.custom_fields?.postSetFormFilled
  ).length;
  const setterFormComplianceRate = recordsWithSetter.length > 0 
    ? (setterFormsFilled / recordsWithSetter.length) * 100 
    : 0;

  // Closer form compliance (only for completed/attended calls - shows)
  const closerFormsFilled = showRecords.filter(r => 
    r.closer_form_filled || r.custom_fields?.closerFormFilled
  ).length;
  const closerFormComplianceRate = showRecords.length > 0 
    ? (closerFormsFilled / showRecords.length) * 100 
    : 0;

  // Missing forms (for "Who's Dropping the Ball" section)
  const missingSetterForms = recordsWithSetter.filter(r => 
    !r.post_set_form_filled && !r.custom_fields?.postSetFormFilled
  ).map(r => ({
    id: r.appointment_id || r.deal_id || r.id,
    leadName: r.lead_name || r.name,
    personName: r.setter_name || r.custom_fields?.setterName || r.custom_fields?.setBy || 'Unknown',
    formType: 'setter' as const,
    bookedAt: r.booked_at || r.scheduled_for || r.created_at || r.close_date,
  }));

  const missingCloserForms = showRecords.filter(r => 
    !r.closer_form_filled && !r.custom_fields?.closerFormFilled
  ).map(r => ({
    id: r.appointment_id || r.deal_id || r.id,
    leadName: r.lead_name || r.name,
    personName: r.closer_name || r.custom_fields?.closerName || r.pipeline || 'Unknown',
    formType: 'closer' as const,
    bookedAt: r.booked_at || r.scheduled_for || r.created_at || r.close_date,
  }));

  // Per-person compliance breakdown
  const setterCompliance: Record<string, { total: number; filled: number; rate: number }> = {};
  recordsWithSetter.forEach(r => {
    const setter = r.setter_name || r.custom_fields?.setterName || r.custom_fields?.setBy || 'Unknown';
    if (!setterCompliance[setter]) {
      setterCompliance[setter] = { total: 0, filled: 0, rate: 0 };
    }
    setterCompliance[setter].total++;
    if (r.post_set_form_filled || r.custom_fields?.postSetFormFilled) {
      setterCompliance[setter].filled++;
    }
  });
  Object.keys(setterCompliance).forEach(setter => {
    const data = setterCompliance[setter];
    data.rate = data.total > 0 ? (data.filled / data.total) * 100 : 0;
  });

  const closerCompliance: Record<string, { total: number; filled: number; rate: number }> = {};
  showRecords.forEach(r => {
    const closer = r.closer_name || r.custom_fields?.closerName || r.pipeline || 'Unknown';
    if (!closerCompliance[closer]) {
      closerCompliance[closer] = { total: 0, filled: 0, rate: 0 };
    }
    closerCompliance[closer].total++;
    if (r.closer_form_filled || r.custom_fields?.closerFormFilled) {
      closerCompliance[closer].filled++;
    }
  });
  Object.keys(closerCompliance).forEach(closer => {
    const data = closerCompliance[closer];
    data.rate = data.total > 0 ? (data.filled / data.total) * 100 : 0;
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
    // Form compliance metrics
    setterFormComplianceRate,
    closerFormComplianceRate,
    setterFormsFilled,
    closerFormsFilled,
    totalSetterFormsRequired: recordsWithSetter.length,
    totalCloserFormsRequired: showRecords.length,
    missingSetterForms,
    missingCloserForms,
    setterCompliance,
    closerCompliance,
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
    // Form compliance metrics
    setterFormComplianceRate: 0,
    closerFormComplianceRate: 0,
    setterFormsFilled: 0,
    closerFormsFilled: 0,
    totalSetterFormsRequired: 0,
    totalCloserFormsRequired: 0,
    missingSetterForms: [],
    missingCloserForms: [],
    setterCompliance: {},
    closerCompliance: {},
  };
}
