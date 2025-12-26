import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SheetType } from "./useLiveSheetData";

interface WriteBackParams {
  sheetType: SheetType;
  operation: 'insert' | 'update' | 'delete';
  rowNumber?: number; // Required for update/delete
  data: Record<string, any>;
  configId: string;
}

export function useSheetWriteBack() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ sheetType, operation, rowNumber, data, configId }: WriteBackParams) => {
      const { data: result, error } = await supabase.functions.invoke('google-sheets-write-back', {
        body: {
          configuration_id: configId,
          operation,
          row_number: rowNumber,
          data,
          sheet_type: sheetType,
        }
      });

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate the relevant query to refetch data
      queryClient.invalidateQueries({ queryKey: ['live-sheet-data', variables.sheetType] });
      
      const actionText = variables.operation === 'insert' ? 'added' : 
                         variables.operation === 'update' ? 'updated' : 'deleted';
      toast({ 
        title: `Record ${actionText}`,
        description: "Changes saved to Google Sheets"
      });
    },
    onError: (error: any) => {
      console.error('Write-back error:', error);
      toast({
        title: "Failed to save changes",
        description: error.message || "Could not update Google Sheets",
        variant: "destructive",
      });
    },
  });

  return {
    writeBack: mutation.mutate,
    writeBackAsync: mutation.mutateAsync,
    isWriting: mutation.isPending,
    error: mutation.error,
  };
}
