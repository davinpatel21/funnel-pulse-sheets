import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, X, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Mapping {
  sheetColumn: string;
  dbField: string;
  confidence?: number;
  customFieldKey?: string;
}

interface SheetConfigEditorProps {
  configId: string;
  sheetName: string;
  sheetType: string;
  mappings: Mapping[];
  onClose: () => void;
}

const SHEET_TYPE_OPTIONS = [
  { value: 'leads', label: 'Leads', description: 'Contact info, lead sources' },
  { value: 'appointments', label: 'Appointments', description: 'Call bookings, scheduled meetings' },
  { value: 'calls', label: 'Calls', description: 'Individual call records' },
  { value: 'deals', label: 'Deals (Post Call)', description: 'Revenue, cash collected, deal outcomes' },
  { value: 'team', label: 'Team', description: 'Team member profiles' },
];

const DB_FIELD_OPTIONS = [
  // Deal/Revenue fields - prioritize for Post Call sheets
  { value: 'revenue_amount', label: 'Revenue Amount ($)', types: ['deals'] },
  { value: 'cash_collected', label: 'Cash Collected ($)', types: ['deals'] },
  { value: 'cash_after_fees', label: 'Cash After Fees ($)', types: ['deals'] },
  { value: 'fees_amount', label: 'Fees Amount ($)', types: ['deals'] },
  { value: 'call_status', label: 'Call Status (Closed/No Show/No Close)', types: ['deals', 'appointments', 'calls'] },
  { value: 'deal_status', label: 'Deal Status', types: ['deals'] },
  { value: 'payment_platform', label: 'Payment Platform/Type', types: ['deals'] },
  { value: 'closed_at', label: 'Closed At (Date)', types: ['deals'] },
  { value: 'recording_url', label: 'Recording URL', types: ['appointments', 'calls', 'deals'] },
  
  // Common fields
  { value: 'name', label: 'Name', types: ['leads', 'appointments', 'calls', 'deals'] },
  { value: 'email', label: 'Email', types: ['leads', 'team', 'deals'] },
  { value: 'phone', label: 'Phone', types: ['leads', 'team'] },
  { value: 'notes', label: 'Notes', types: ['leads', 'appointments', 'calls', 'deals'] },
  
  // Lead fields
  { value: 'source', label: 'Lead Source', types: ['leads'] },
  { value: 'status', label: 'Lead Status', types: ['leads'] },
  { value: 'utm_source', label: 'UTM Source', types: ['leads'] },
  
  // Appointment fields
  { value: 'scheduled_at', label: 'Scheduled At', types: ['appointments'] },
  { value: 'booked_at', label: 'Booked At', types: ['appointments'] },
  { value: 'setter_name', label: 'Setter Name', types: ['appointments', 'calls', 'deals'] },
  { value: 'closer_name', label: 'Closer Name', types: ['appointments', 'calls', 'deals'] },
  { value: 'post_set_form_filled', label: 'Post Set Form (Checkbox)', types: ['appointments', 'calls', 'deals'] },
  { value: 'closer_form_filled', label: 'Closer Form Filled (Checkbox)', types: ['appointments', 'calls', 'deals'] },
  { value: 'pipeline', label: 'Pipeline', types: ['appointments'] },
  
  // Team fields
  { value: 'full_name', label: 'Full Name', types: ['team'] },
  { value: 'role', label: 'Role', types: ['team'] },
  
  // Universal
  { value: 'custom', label: '→ Custom Field', types: ['leads', 'appointments', 'calls', 'deals', 'team'] },
  { value: 'skip', label: '✕ Skip this column', types: ['leads', 'appointments', 'calls', 'deals', 'team'] },
];

export function SheetConfigEditor({ configId, sheetName, sheetType, mappings, onClose }: SheetConfigEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editedType, setEditedType] = useState(sheetType);
  const [editedMappings, setEditedMappings] = useState<Mapping[]>(mappings);
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const handleMappingChange = (index: number, newDbField: string) => {
    setEditedMappings(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], dbField: newDbField };
      return updated;
    });
  };

  const handleCustomFieldKeyChange = (index: number, customFieldKey: string) => {
    setEditedMappings(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], customFieldKey };
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('sheet_configurations')
        .update({
          sheet_type: editedType,
          mappings: editedMappings as any,
          updated_at: new Date().toISOString(),
        })
        .eq('id', configId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['sheet-configurations'] });
      toast({ 
        title: "Configuration saved", 
        description: `Sheet type changed to "${editedType}" with updated mappings.`
      });
      onClose();
    } catch (error: any) {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Filter field options based on selected sheet type
  const getFieldOptions = () => {
    return DB_FIELD_OPTIONS.filter(opt => opt.types.includes(editedType));
  };

  const hasChanges = editedType !== sheetType || 
    JSON.stringify(editedMappings) !== JSON.stringify(mappings);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between mt-2">
          <span className="text-sm font-medium">Edit Configuration</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4 border-t pt-4">
        {/* Sheet Type Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Sheet Type</label>
          <Select value={editedType} onValueChange={setEditedType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHEET_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editedType !== sheetType && (
            <Badge variant="outline" className="text-xs">
              Changed from "{sheetType}"
            </Badge>
          )}
        </div>

        {/* Field Mappings */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Field Mappings</label>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {editedMappings.map((mapping, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <span className="w-1/3 truncate font-mono text-xs bg-muted px-2 py-1 rounded">
                  {mapping.sheetColumn}
                </span>
                <span className="text-muted-foreground">→</span>
                <Select
                  value={mapping.dbField}
                  onValueChange={(value) => handleMappingChange(index, value)}
                >
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getFieldOptions().map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mapping.dbField === 'custom' && (
                  <input
                    type="text"
                    placeholder="Key"
                    value={mapping.customFieldKey || ''}
                    onChange={(e) => handleCustomFieldKeyChange(index, e.target.value)}
                    className="h-8 w-20 rounded border border-input bg-background px-2 text-xs"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button 
            onClick={handleSave} 
            disabled={saving || !hasChanges}
            size="sm"
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-3 w-3 mr-1" />
                Save Changes
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
