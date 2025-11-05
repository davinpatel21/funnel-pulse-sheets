import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting auto-sync process...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: configs, error: configsError } = await supabase
      .from('sheet_configurations')
      .select('*')
      .eq('is_active', true);

    if (configsError) throw configsError;

    const results = [];

    for (const config of configs || []) {
      console.log(`Syncing sheet config: ${config.id} (${config.sheet_type})`);
      
      const { data: credentials, error: credError } = await supabase
        .from('google_sheets_credentials')
        .select('*')
        .eq('user_id', config.user_id)
        .single();

      if (credError || !credentials) {
        console.log(`No credentials for user ${config.user_id}, skipping`);
        continue;
      }

      let accessToken = credentials.access_token;
      const expiresAt = new Date(credentials.expires_at);
      
      if (expiresAt <= new Date()) {
        console.log('Token expired, refreshing...');
        accessToken = await refreshAccessToken(credentials.refresh_token, config.user_id, supabase);
      }

      const sheetIdMatch = config.sheet_url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) {
        console.error(`Invalid sheet URL: ${config.sheet_url}`);
        continue;
      }
      const sheetId = sheetIdMatch[1];

      let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      if (config.sheet_name) {
        csvUrl += `&gid=0`; // Will be replaced with actual gid lookup if needed
        console.log(`Syncing specific sheet tab: ${config.sheet_name}`);
      }
      const csvResponse = await fetch(csvUrl);
      if (!csvResponse.ok) {
        console.error(`Failed to fetch sheet ${sheetId}`);
        continue;
      }

      const csvText = await csvResponse.text();
      const rows = parseCsv(csvText);
      
      if (!rows || rows.length === 0) {
        console.log(`No data in sheet ${sheetId}`);
        continue;
      }

      let successCount = 0;
      let errorCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1;

        try {
          const transformedRecord = await transformRow(row, config, supabase, config.user_id);
          
          if (!transformedRecord) {
            console.log(`Skipping invalid row ${rowNumber}`);
            continue;
          }

          if (config.sheet_type === 'appointments') {
            await syncAppointmentRow(transformedRecord, rowNumber, config.id, supabase);
          } else {
            await upsertRecord(config.sheet_type, transformedRecord, rowNumber, config.id, supabase);
          }

          successCount++;
        } catch (error) {
          console.error(`Error syncing row ${rowNumber}:`, error);
          errorCount++;
        }
      }

      await supabase
        .from('sheet_configurations')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', config.id);

      results.push({
        config_id: config.id,
        sheet_type: config.sheet_type,
        success_count: successCount,
        error_count: errorCount
      });
    }

    return new Response(
      JSON.stringify({ 
        message: 'Sync completed',
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function transformRow(row: any, config: any, supabase: any, userId: string): Promise<any | null> {
  const record: any = { user_id: userId };
  const tempData: any = {};

  for (const mapping of config.mappings) {
    const value = row[mapping.sheetColumn];
    
    if (!value || mapping.dbField === 'ignore') continue;

    let transformedValue = value;

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
        if (value.toUpperCase().includes('IN CRM') || value.toUpperCase() === 'N/A') continue;
        break;
      case 'parse_currency':
        transformedValue = parseFloat(value.replace(/[$,]/g, '')) || 0;
        break;
    }

    if (mapping.customFieldKey === 'appointmentDate' || 
        mapping.customFieldKey === 'appointmentTime' || 
        mapping.customFieldKey === 'rawDate') {
      tempData[mapping.customFieldKey] = transformedValue;
      continue;
    }

    if (mapping.dbField === 'booked_at' || mapping.dbField === 'scheduled_at') {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          transformedValue = date.toISOString();
        }
      } catch (e) {
        console.warn(`Failed to parse date: ${value}`);
      }
    }

    if (mapping.customFieldKey === 'closerName' || mapping.customFieldKey === 'setterName') {
      tempData[mapping.customFieldKey] = transformedValue;
      continue;
    }

    if (mapping.dbField === 'custom_fields') {
      if (!record.custom_fields) record.custom_fields = {};
      record.custom_fields[mapping.customFieldKey] = transformedValue;
    } else {
      record[mapping.dbField] = transformedValue;
    }
  }

  if (tempData.appointmentDate && (tempData.appointmentTime || tempData.rawDate)) {
    try {
      const dateStr = `${tempData.appointmentDate} ${tempData.appointmentTime || tempData.rawDate}`;
      const combinedDate = new Date(dateStr);
      if (!isNaN(combinedDate.getTime())) {
        record.scheduled_at = combinedDate.toISOString();
      }
    } catch (e) {
      console.warn('Failed to combine dates');
    }
  }

  const callStatusValue = row['Call Status'] || row['Status'] || row['Result'];
  if (callStatusValue) {
    const normalized = callStatusValue.toLowerCase().trim();
    
    if (normalized === 'closed' || normalized.includes('won')) {
      record.status = 'completed';
      record.created_deal = true;
    } else if (normalized === 'no close' || normalized.includes('no close')) {
      record.status = 'completed';
      record.created_deal = false;
    } else if (normalized.includes('no show') || normalized === 'dns') {
      record.status = 'no_show';
    } else if (normalized.includes('cancelled')) {
      record.status = 'cancelled';
    } else {
      record.status = 'scheduled';
    }
    
    if (!record.custom_fields) record.custom_fields = {};
    record.custom_fields.callStatus = callStatusValue;
  }

  const revenueValue = row['Revenue'];
  const cashValue = row['Cash Collected'];
  const paymentPlatform = row['Payment Platform'];
  
  if (record.created_deal && (revenueValue || cashValue)) {
    record.revenue_amount = parseFloat(revenueValue?.replace(/[$,]/g, '') || '0');
    record.cash_collected = parseFloat(cashValue?.replace(/[$,]/g, '') || '0');
    record.payment_platform = paymentPlatform;
  }

  record.closer_name = tempData.closerName;
  record.setter_name = tempData.setterName;

  if (!record.name || !record.email) {
    return null;
  }

  if (!record.source) record.source = 'other';
  if (!record.status) record.status = 'scheduled';

  return record;
}

async function syncAppointmentRow(record: any, rowNumber: number, configId: string, supabase: any) {
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('email', record.email)
    .single();

  let leadId;
  if (existingLead) {
    leadId = existingLead.id;
    await supabase
      .from('leads')
      .update({
        name: record.name,
        phone: record.phone,
        utm_source: record.utm_source,
        custom_fields: record.custom_fields,
        source: record.source
      })
      .eq('id', leadId);
  } else {
    const { data: newLead } = await supabase
      .from('leads')
      .insert({
        user_id: record.user_id,
        name: record.name,
        email: record.email,
        phone: record.phone,
        utm_source: record.utm_source,
        custom_fields: record.custom_fields,
        source: record.source,
        status: 'new'
      })
      .select('id')
      .single();
    leadId = newLead.id;
  }

  let setterId = null;
  let closerId = null;

  if (record.setter_name) {
    setterId = await resolveProfile(record.setter_name, supabase);
  }
  if (record.closer_name) {
    closerId = await resolveProfile(record.closer_name, supabase);
  }

  const syncMeta = {
    sheet_config_id: configId,
    sheet_row_number: rowNumber,
    last_synced_at: new Date().toISOString()
  };

  const { data: existingAppt } = await supabase
    .from('appointments')
    .select('*')
    .eq('sync_metadata->>sheet_config_id', configId)
    .eq('sync_metadata->>sheet_row_number', rowNumber.toString())
    .single();

  const apptData = {
    lead_id: leadId,
    setter_id: setterId,
    closer_id: closerId,
    booked_at: record.booked_at,
    scheduled_at: record.scheduled_at,
    status: record.status,
    notes: record.notes,
    recording_url: record.recording_url,
    post_call_form_url: record.post_call_form_url,
    closer_form_status: record.closer_form_status,
    sync_metadata: syncMeta
  };

  let appointmentId;
  if (existingAppt) {
    if (existingAppt.sync_metadata?.modified_locally) {
      console.log(`Skipping locally modified appointment (row ${rowNumber})`);
      return;
    }
    
    await supabase
      .from('appointments')
      .update(apptData)
      .eq('id', existingAppt.id);
    appointmentId = existingAppt.id;
  } else {
    const { data: newAppt } = await supabase
      .from('appointments')
      .insert(apptData)
      .select('id')
      .single();
    appointmentId = newAppt.id;
  }

  if (record.created_deal && record.revenue_amount) {
    const { data: existingDeal } = await supabase
      .from('deals')
      .select('id')
      .eq('appointment_id', appointmentId)
      .single();

    const dealData = {
      lead_id: leadId,
      appointment_id: appointmentId,
      closer_id: closerId,
      setter_id: setterId,
      revenue_amount: record.revenue_amount,
      cash_collected: record.cash_collected || 0,
      payment_platform: record.payment_platform,
      status: 'won',
      closed_at: new Date().toISOString(),
      sync_metadata: syncMeta
    };

    if (!existingDeal) {
      await supabase.from('deals').insert(dealData);
    } else {
      await supabase.from('deals').update(dealData).eq('id', existingDeal.id);
    }
  }
}

async function resolveProfile(fullName: string, supabase: any): Promise<string | null> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .ilike('full_name', fullName)
    .single();

  if (existing) {
    return existing.id;
  }

  const { data: newProfile } = await supabase
    .from('profiles')
    .insert({
      full_name: fullName,
      email: `${fullName.replace(/\s+/g, '.').toLowerCase()}@placeholder.com`,
      role: 'closer'
    })
    .select('id')
    .single();

  return newProfile.id;
}

async function upsertRecord(tableName: string, record: any, rowNumber: number, configId: string, supabase: any) {
  const syncMeta = {
    sheet_config_id: configId,
    sheet_row_number: rowNumber,
    last_synced_at: new Date().toISOString()
  };

  const { data: existing } = await supabase
    .from(tableName)
    .select('*')
    .eq('sync_metadata->>sheet_config_id', configId)
    .eq('sync_metadata->>sheet_row_number', rowNumber.toString())
    .single();

  const dataWithMeta = { ...record, sync_metadata: syncMeta };

  if (existing) {
    if (existing.sync_metadata?.modified_locally) {
      console.log(`Skipping locally modified ${tableName} (row ${rowNumber})`);
      return;
    }
    await supabase.from(tableName).update(dataWithMeta).eq('id', existing.id);
  } else {
    await supabase.from(tableName).insert(dataWithMeta);
  }
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

async function refreshAccessToken(refreshToken: string, userId: string, supabase: any): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_SHEETS_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);

  await supabase
    .from('google_sheets_credentials')
    .update({
      access_token: data.access_token,
      expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);

  return data.access_token;
}
