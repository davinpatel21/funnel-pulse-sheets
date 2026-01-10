import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSheetConfigurations } from "./useSheetConfigurations";
import { useEffect, useState } from "react";

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
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setUserId(user?.id || null);
    };
    
    init();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUserId(session?.user?.id || null);
    });
    
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Check for Google credentials
  const { data: credentials, isLoading: isLoadingCredentials } = useQuery({
    queryKey: ['google-sheets-credentials', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('google_sheets_credentials')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  });

  // Reuse sheet configurations from the shared hook
  const { data: configs, isLoading: isLoadingConfigs } = useSheetConfigurations();

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
