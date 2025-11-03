import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSheetConfigurations() {
  return useQuery({
    queryKey: ['sheet-configurations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sheet_configurations')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });
}
