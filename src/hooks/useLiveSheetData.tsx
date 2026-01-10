import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSheetConfigurations } from "./useSheetConfigurations";
import { useToast } from "@/hooks/use-toast";
import { invokeWithAuth } from "@/lib/authHelpers";

export type SheetType = 'team' | 'leads' | 'appointments' | 'calls' | 'deals';

export interface LiveSheetDataResult<T> {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  lastSyncedAt: string | null;
  sheetUrl: string | null;
  isConfigured: boolean;
}

export function useLiveSheetData<T = any>(sheetType: SheetType): LiveSheetDataResult<T> {
  const { data: configs, isLoading: isLoadingConfigs } = useSheetConfigurations();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const config = configs?.find(c => c.sheet_type === sheetType);
  
  const { data, isLoading: isLoadingData, error, refetch } = useQuery({
    queryKey: ['live-sheet-data', sheetType, config?.id],
    queryFn: async () => {
      if (!config) return [];
      
      const { data: result, error } = await invokeWithAuth('google-sheets-live', {
        body: { configuration_id: config.id }
      });
      
      if (error) {
        console.error('Error fetching sheet data:', error);
        throw error;
      }
      
      return transformData(sheetType, result?.data || []);
    },
    enabled: !!config,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every minute
    retry: 2,
  });

  const handleRefetch = () => {
    refetch();
    toast({ title: "Refreshing data from Google Sheets..." });
  };

  return {
    data: (data || []) as T[],
    isLoading: isLoadingConfigs || isLoadingData,
    error: error as Error | null,
    refetch: handleRefetch,
    lastSyncedAt: config?.last_synced_at || null,
    sheetUrl: config?.sheet_url || null,
    isConfigured: !!config,
  };
}

// Transform raw sheet data to match the canonical schema
function transformData(sheetType: SheetType, rawData: any[]): any[] {
  switch (sheetType) {
    case 'team':
      return rawData.map((row: any, index: number) => ({
        team_member_id: row.team_member_id || row.id || `team-${index}`,
        first_name: row.first_name || row.name?.split(' ')[0] || '',
        last_name: row.last_name || row.name?.split(' ').slice(1).join(' ') || '',
        full_name: row.full_name || row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        email: row.email || '',
        phone: row.phone || '',
        role: normalizeRole(row.role),
        department: row.department || '',
        active: row.active !== false && row.is_deleted !== true,
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        _rowNumber: row._rowNumber,
      }));
      
    case 'leads':
      return rawData.map((row: any, index: number) => ({
        lead_id: row.lead_id || row.id || `lead-${index}`,
        full_name: row.full_name || row.name || '',
        email: row.email || '',
        phone: row.phone || '',
        source: row.source || '',
        utm_source: row.utm_source || '',
        utm_campaign: row.utm_campaign || '',
        owner_id: row.owner_id || null,
        setter_id: row.setter_id || null,
        closer_id: row.closer_id || null,
        status: normalizeLeadStatus(row.status),
        notes: row.notes || '',
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        _rowNumber: row._rowNumber,
      }));
      
    case 'appointments':
      return rawData.map((row: any, index: number) => ({
        appointment_id: row.appointment_id || row.id || `appt-${index}`,
        lead_id: row.lead_id || null,
        lead_name: row.name || row.full_name || row.lead_name || '',
        lead_email: row.email || row.lead_email || '',
        scheduled_for: row.scheduled_for || row.scheduled_at || row.booking_time || '',
        setter_id: row.setter_id || null,
        setter_name: row.setter_name || row.setter || '',
        closer_id: row.closer_id || null,
        closer_name: row.closer_name || row.closer || '',
        status: normalizeAppointmentStatus(row.status),
        notes: row.notes || '',
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        _rowNumber: row._rowNumber,
      }));
      
    case 'calls':
      return rawData.map((row: any, index: number) => ({
        call_id: row.call_id || row.id || `call-${index}`,
        lead_id: row.lead_id || null,
        lead_name: row.name || row.full_name || row.lead_name || '',
        lead_email: row.email || row.lead_email || '',
        appointment_id: row.appointment_id || null,
        call_time: row.call_time || row.created_at || new Date().toISOString(),
        setter_id: row.setter_id || null,
        setter_name: row.setter_name || row.setter || '',
        closer_id: row.closer_id || null,
        closer_name: row.closer_name || row.closer || '',
        status: normalizeCallStatus(row.status || row.call_status),
        duration_seconds: parseInt(row.duration_seconds || row.duration || '0') || 0,
        recording_url: row.recording_url || '',
        call_notes: row.call_notes || row.notes || '',
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        _rowNumber: row._rowNumber,
      }));
      
    case 'deals':
      return rawData.map((row: any, index: number) => ({
        deal_id: row.deal_id || row.id || `deal-${index}`,
        lead_id: row.lead_id || null,
        lead_name: row.name || row.full_name || row.lead_name || '',
        lead_email: row.email || row.lead_email || '',
        call_id: row.call_id || null,
        closer_id: row.closer_id || null,
        closer_name: row.closer_name || row.closer || '',
        stage: normalizeDealStage(row.stage || row.status),
        amount: parseFloat(row.amount || row.revenue_amount || '0') || 0,
        cash_collected: parseFloat(row.cash_collected || '0') || 0,
        currency: row.currency || 'USD',
        payment_platform: row.payment_platform || '',
        close_date: row.close_date || row.closed_at || '',
        loss_reason: row.loss_reason || '',
        notes: row.notes || '',
        recording_url: row.recording_url || '',
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        _rowNumber: row._rowNumber,
      }));
      
    default:
      return rawData;
  }
}

function normalizeRole(role: string): string {
  const r = (role || '').toLowerCase().trim();
  if (r.includes('admin') || r.includes('manager')) return 'admin';
  if (r.includes('close')) return 'closer';
  if (r.includes('set')) return 'setter';
  return 'other';
}

function normalizeLeadStatus(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s.includes('new')) return 'new';
  if (s.includes('contact')) return 'contacted';
  if (s.includes('book')) return 'booked';
  if (s.includes('no') && s.includes('show')) return 'no_show';
  if (s.includes('show')) return 'showed';
  if (s.includes('won') || s.includes('close') || s.includes('deal')) return 'won';
  if (s.includes('lost') || s.includes('dead')) return 'lost';
  if (s.includes('unqual')) return 'unqualified';
  return 'new';
}

function normalizeAppointmentStatus(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s.includes('book') || s.includes('schedul')) return 'booked';
  if (s.includes('resch')) return 'rescheduled';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('no') && s.includes('show')) return 'no_show';
  if (s.includes('complete') || s.includes('done') || s.includes('showed')) return 'completed';
  return 'booked';
}

function normalizeCallStatus(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s.includes('connect') || s.includes('live') || s.includes('answer')) return 'connected';
  if (s.includes('no') && s.includes('answer')) return 'no_answer';
  if (s.includes('voice') || s.includes('vm')) return 'voicemail';
  if (s.includes('resch')) return 'rescheduled';
  if (s.includes('complete') || s.includes('done')) return 'completed';
  return 'connected';
}

function normalizeDealStage(stage: string): string {
  const s = (stage || '').toLowerCase().trim();
  if (s.includes('won') || s.includes('close')) return 'won';
  if (s.includes('lost') || s.includes('dead')) return 'lost';
  if (s.includes('refund')) return 'refund';
  if (s.includes('charge')) return 'chargeback';
  return 'pipeline';
}
