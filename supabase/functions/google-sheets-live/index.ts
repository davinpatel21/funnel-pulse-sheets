import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { configuration_id } = await req.json();

    // Fetch the configuration
    const { data: config, error: configError } = await supabase
      .from('sheet_configurations')
      .select('*')
      .eq('id', configuration_id)
      .eq('user_id', user.id)
      .single();

    if (configError || !config) {
      throw new Error('Configuration not found');
    }

    // Extract sheet ID from URL
    const sheetId = extractSheetId(config.sheet_url);
    if (!sheetId) {
      throw new Error('Invalid sheet URL');
    }

    // Fetch data from Google Sheets (CSV export)
    const gid = extractGid(config.sheet_url);
    let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    if (gid) {
      csvUrl += `&gid=${gid}`;
      console.log(`Fetching specific tab with gid=${gid}`);
    }
    
    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) {
      throw new Error('Failed to fetch sheet data. Make sure the sheet is publicly accessible.');
    }

    const csvText = await csvResponse.text();
    console.log(`Fetched CSV from sheet ${sheetId}, length: ${csvText.length} chars`);
    
    const rows = parseCsv(csvText);
    console.log(`Parsed ${rows.length} rows from CSV`);

    // Transform data based on sheet type using canonical schema
    const transformedData = rows.map((row, index) => {
      // Keep track of original row number for write-back (1-indexed, +2 for header and 0-index)
      const record: any = { _rowNumber: index + 2 };

      // Map all columns from the row directly
      Object.keys(row).forEach(key => {
        const normalizedKey = normalizeColumnName(key);
        record[normalizedKey] = row[key];
      });

      // Apply sheet-type specific transformations
      switch (config.sheet_type) {
        case 'team':
          record.team_member_id = record.team_member_id || record.id || `team-${index}`;
          record.full_name = record.full_name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.name;
          record.role = normalizeRole(record.role);
          record.active = record.active !== 'false' && record.is_deleted !== 'true';
          break;

        case 'leads':
          record.lead_id = record.lead_id || record.id || `lead-${index}`;
          record.full_name = record.full_name || record.name;
          record.status = normalizeLeadStatus(record.status);
          break;

        case 'appointments':
          record.appointment_id = record.appointment_id || record.id || `appt-${index}`;
          record.lead_name = record.lead_name || record.name || record.full_name;
          record.lead_email = record.lead_email || record.email;
          record.scheduled_for = record.scheduled_for || record.scheduled_at || record.booking_time || combineDateTimeFields(record);
          record.setter_name = record.setter_name || record.setter;
          record.closer_name = record.closer_name || record.closer;
          record.status = normalizeAppointmentStatus(record.status || record.call_status);
          break;

        case 'calls':
          record.call_id = record.call_id || record.id || `call-${index}`;
          record.lead_name = record.lead_name || record.name || record.full_name;
          record.lead_email = record.lead_email || record.email;
          record.call_time = record.call_time || record.created_at || record.date;
          record.setter_name = record.setter_name || record.setter;
          record.closer_name = record.closer_name || record.closer;
          record.status = normalizeCallStatus(record.status || record.call_status);
          record.duration_seconds = parseInt(record.duration_seconds || record.duration || '0') || 0;
          record.call_notes = record.call_notes || record.notes;
          break;

        case 'deals':
          record.deal_id = record.deal_id || record.id || `deal-${index}`;
          record.lead_name = record.lead_name || record.name || record.full_name;
          record.lead_email = record.lead_email || record.email;
          record.closer_name = record.closer_name || record.closer;
          record.stage = normalizeDealStage(record.stage || record.status);
          record.amount = parseFloat(String(record.amount || record.revenue || record.revenue_amount || '0').replace(/[$,]/g, '')) || 0;
          record.cash_collected = parseFloat(String(record.cash_collected || '0').replace(/[$,]/g, '')) || 0;
          record.currency = record.currency || 'USD';
          record.close_date = record.close_date || record.closed_at;
          break;
      }

      return record;
    });

    console.log(`Transformed ${transformedData.length} records for sheet_type: ${config.sheet_type}`);

    // Filter out deleted/empty records
    const validRecords = transformedData.filter(record => {
      // Skip if marked as deleted
      if (record.is_deleted === 'true' || record.is_deleted === true) return false;
      
      // For most types, require at least name or email
      if (config.sheet_type !== 'team') {
        const hasName = record.full_name || record.lead_name || record.name;
        const hasEmail = record.email || record.lead_email;
        if (!hasName && !hasEmail) return false;
      }
      
      return true;
    });

    console.log(`Validation: ${validRecords.length}/${transformedData.length} records valid`);

    // Update last_synced_at
    await supabase
      .from('sheet_configurations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', configuration_id);

    return new Response(
      JSON.stringify({ 
        data: validRecords,
        sheet_type: config.sheet_type,
        row_count: validRecords.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in google-sheets-live:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractSheetId(sheetUrl: string): string | null {
  const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function extractGid(sheetUrl: string): string | null {
  const match = sheetUrl.match(/[?#&]gid=([0-9]+)/);
  return match ? match[1] : null;
}

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function combineDateTimeFields(record: any): string | null {
  // Try to combine common date/time field patterns
  const dateField = record.appointment_date || record.date || record.booking_date;
  const timeField = record.appointment_time || record.time || record.booking_time;
  
  if (dateField && timeField) {
    try {
      const combined = new Date(`${dateField} ${timeField}`);
      if (!isNaN(combined.getTime())) {
        return combined.toISOString();
      }
    } catch {
      // Fall through
    }
  }
  
  return dateField || null;
}

function parseCsv(csvText: string): any[] {
  const lines = csvText.split('\n');
  if (lines.length === 0) return [];

  const parseRow = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseRow(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseRow(lines[i]);
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    rows.push(row);
  }

  return rows;
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
  if (s.includes('complete') || s.includes('done') || s.includes('showed') || s.includes('closed')) return 'completed';
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
