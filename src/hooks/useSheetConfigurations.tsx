import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

export function useSheetConfigurations() {
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthReady(true);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) setIsAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    },
    enabled: isAuthReady,
  });
}
