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
    if (rows.length > 0) {
      console.log('First row sample:', JSON.stringify(rows[0]));
    }

    // Apply mappings to transform data
    const transformedData = rows.map(row => {
      const record: any = { user_id: user.id };
      const tempData: any = {}; // Temp storage for fields that need combining
      
      config.mappings.forEach((mapping: any) => {
        const value = row[mapping.sheetColumn];
        
        if (!value || mapping.dbField === 'ignore') return;

        let transformedValue = value;

        // Apply transformations
        switch (mapping.transformation) {
          case 'trim':
            transformedValue = value.trim();
            break;
          case 'lowercase_trim':
            transformedValue = value.toLowerCase().trim();
            break;
          case 'clean_phone':
            transformedValue = value.replace(/[^0-9+]/g, '');
            break;
          case 'skip_if_placeholder':
            // Skip "IN CRM" or similar placeholder values
            if (value.toUpperCase().includes('IN CRM') || value.toUpperCase() === 'N/A') return;
            break;
          case 'parse_currency':
            // Parse currency values: "$1,200" → 1200
            transformedValue = parseFloat(value.replace(/[$,]/g, '')) || 0;
            break;
          case 'map_to_enum':
            if (mapping.dbField === 'source') {
              transformedValue = mapToSourceEnum(value);
            } else if (mapping.dbField === 'status') {
              transformedValue = mapToStatusEnum(value);
            }
            break;
        }

        // Store date/time components temporarily for combining
        if (mapping.customFieldKey === 'appointmentDate' || 
            mapping.customFieldKey === 'appointmentTime' || 
            mapping.customFieldKey === 'rawDate') {
          tempData[mapping.customFieldKey] = transformedValue;
          return; // Don't add to record yet
        }

        // Parse single date fields
        if (mapping.dbField === 'booked_at' || mapping.dbField === 'scheduled_at') {
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              transformedValue = date.toISOString();
            }
          } catch (e) {
            console.warn(`Failed to parse date for ${mapping.dbField}: ${value}`);
          }
        }

        // Store names for later profile lookup
        if (mapping.customFieldKey === 'closerName' || mapping.customFieldKey === 'setterName') {
          if (!record.custom_fields) record.custom_fields = {};
          record.custom_fields[mapping.customFieldKey] = transformedValue;
          return;
        }

        // Route to appropriate field
        if (mapping.dbField === 'custom_fields') {
          if (!record.custom_fields) record.custom_fields = {};
          record.custom_fields[mapping.customFieldKey] = transformedValue;
        } else {
          record[mapping.dbField] = transformedValue;
        }
      });

      // COMBINE DATE FIELDS if we have them stored
      if (tempData.appointmentDate && (tempData.appointmentTime || tempData.rawDate)) {
        try {
          const dateStr = `${tempData.appointmentDate} ${tempData.appointmentTime || tempData.rawDate}`;
          const combinedDate = new Date(dateStr);
          if (!isNaN(combinedDate.getTime())) {
            record.scheduled_at = combinedDate.toISOString();
          }
        } catch (e) {
          console.warn('Failed to combine date fields:', tempData);
        }
      }

      // DERIVE STATUS from "Call Status" column
      const callStatusValue = row['Call Status'] || row['Status'] || row['Result'];
      if (callStatusValue) {
        const normalized = callStatusValue.toLowerCase().trim();
        
        if (normalized === 'closed' || normalized.includes('won')) {
          record.status = 'completed';
          record.created_deal = true; // Flag to create deal
        } else if (normalized === 'no close' || normalized.includes('no close')) {
          record.status = 'completed';
          record.created_deal = false;
        } else if (normalized.includes('no show') || normalized === 'dns' || normalized === 'did not show') {
          record.status = 'no_show';
        } else if (normalized.includes('cancelled')) {
          record.status = 'cancelled';
        } else {
          record.status = 'scheduled';
        }
        
        // Store raw call status
        if (!record.custom_fields) record.custom_fields = {};
        record.custom_fields.callStatus = callStatusValue;
      }

      // Store revenue/cash for potential deal creation
      const revenueValue = row['Revenue'];
      const cashValue = row['Cash Collected'];
      const paymentPlatform = row['Payment Platform'];
      
      if (record.created_deal && (revenueValue || cashValue)) {
        record.revenue_amount = parseFloat(revenueValue?.replace(/[$,]/g, '') || '0');
        record.cash_collected = parseFloat(cashValue?.replace(/[$,]/g, '') || '0');
        record.payment_platform = paymentPlatform;
      }

      // Apply defaults
      if (!record.source) record.source = 'other';
      if (!record.status) record.status = config.sheet_type === 'appointments' ? 'scheduled' : 'new';

      return record;
    });

    console.log(`Transformed ${transformedData.length} records`);
    if (transformedData.length > 0) {
      console.log('First transformed record:', JSON.stringify(transformedData[0]));
    }

    // Validate transformed data
    const validRecords = transformedData.filter(record => {
      if (!record.name || !record.email) {
        console.warn('Skipping invalid record (missing name or email):', JSON.stringify(record));
        return false;
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

  } catch (error) {
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

function parseCsv(csvText: string): any[] {
  const lines = csvText.split('\n');
  if (lines.length === 0) return [];

  // RFC 4180-compliant CSV parser
  const parseRow = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
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
    if (!lines[i].trim()) continue; // Skip empty lines
    
    const values = parseRow(lines[i]);
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    rows.push(row);
  }

  return rows;
}

function mapToSourceEnum(value: string): string {
  const normalized = value.toLowerCase().trim();
  if (normalized.includes('website') || normalized.includes('web')) return 'website';
  if (normalized.includes('referral') || normalized.includes('refer')) return 'referral';
  if (normalized.includes('social') || normalized.includes('facebook') || normalized.includes('instagram')) return 'social_media';
  if (normalized.includes('ad') || normalized.includes('paid') || normalized.includes('google ads')) return 'paid_ad';
  return 'other';
}

function mapToStatusEnum(value: string): string {
  const normalized = value.toLowerCase().trim();
  if (normalized.includes('new')) return 'new';
  if (normalized.includes('contacted')) return 'contacted';
  if (normalized.includes('qualified')) return 'qualified';
  if (normalized.includes('unqualified')) return 'unqualified';
  if (normalized.includes('lost')) return 'lost';
  return 'new';
}
