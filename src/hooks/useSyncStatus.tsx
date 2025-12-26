import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SyncStatus = 'disconnected' | 'no-sheets' | 'connected' | 'syncing' | 'error';

export interface SyncStatusResult {
  status: SyncStatus;
  hasCredentials: boolean;
  hasSheetConfigs: boolean;
  lastSyncedAt: string | null;
  sheetUrl: string | null;
  isLoading: boolean;
}

export function useSyncStatus(): SyncStatusResult {
  // Check for Google credentials
  const { data: credentials, isLoading: isLoadingCredentials } = useQuery({
    queryKey: ['google-sheets-credentials'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('google_sheets_credentials')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 1000,
  });

  // Check for sheet configurations
  const { data: configs, isLoading: isLoadingConfigs } = useQuery({
    queryKey: ['sheet-configurations'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('sheet_configurations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
  });

  const isLoading = isLoadingCredentials || isLoadingConfigs;
  const hasCredentials = !!credentials;
  const hasSheetConfigs = (configs?.length || 0) > 0;
  
  // Get most recent sync time
  const lastSyncedAt = configs?.reduce((latest: string | null, config: any) => {
    if (!config.last_synced_at) return latest;
    if (!latest) return config.last_synced_at;
    return new Date(config.last_synced_at) > new Date(latest) ? config.last_synced_at : latest;
  }, null) || null;

  // Get sheet URL (first active config)
  const sheetUrl = configs?.[0]?.sheet_url || null;

  // Determine status
  let status: SyncStatus = 'disconnected';
  
  if (isLoading) {
    status = 'syncing';
  } else if (!hasCredentials) {
    status = 'disconnected';
  } else if (!hasSheetConfigs) {
    status = 'no-sheets';
  } else {
    status = 'connected';
  }

  return {
    status,
    hasCredentials,
    hasSheetConfigs,
    lastSyncedAt,
    sheetUrl,
    isLoading,
  };
}
