import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Error codes for frontend handling
type ErrorCode = 
  | 'AUTH_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'CONFIG_NOT_FOUND'
  | 'INVALID_SHEET_URL'
  | 'SHEET_ACCESS_DENIED'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR';

function errorResponse(
  message: string, 
  code: ErrorCode, 
  status: number,
  details?: string
): Response {
  console.error(`Error [${code}]: ${message}`, details ? `- ${details}` : '');
  return new Response(
    JSON.stringify({ 
      error: message, 
      code, 
      status,
      ...(details && { details })
    }),
    { 
      status, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

// Refresh Google OAuth access token
async function refreshAccessToken(
  supabase: any, 
  userId: string, 
  credentials: any
): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_SHEETS_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Google credentials');
  }

  const tokens = await response.json();
  
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await supabase
    .from('google_sheets_credentials')
    .update({
      access_token: tokens.access_token,
      expires_at: expiresAt,
    })
    .eq('user_id', userId);

  return tokens.access_token;
}

// Get valid access token (refresh if needed)
async function getValidAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: credentials, error } = await supabase
    .from('google_sheets_credentials')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !credentials) {
    return null;
  }

  const expiresAt = new Date(credentials.expires_at);
  const now = new Date(Date.now() + 60000);

  if (expiresAt <= now) {
    try {
      return await refreshAccessToken(supabase, userId, credentials);
    } catch {
      return null;
    }
  }

  return credentials.access_token;
}

// Fetch sheet data using OAuth (for private sheets)
async function fetchSheetDataWithOAuth(
  accessToken: string,
  spreadsheetId: string,
  gid?: string
): Promise<any[] | null> {
  try {
    // Get sheet name from gid
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
    const metaResponse = await fetch(metaUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!metaResponse.ok) {
      console.log('OAuth metadata fetch failed:', metaResponse.status);
      return null;
    }

    const metadata = await metaResponse.json();
    const sheets = metadata.sheets || [];

    let sheetName = 'Sheet1';
    if (gid) {
      const sheet = sheets.find((s: any) => String(s.properties.sheetId) === gid);
      if (sheet) {
        sheetName = sheet.properties.title;
      }
    } else if (sheets.length > 0) {
      sheetName = sheets[0].properties.title;
    }

    // Fetch data
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'`)}`;
    const response = await fetch(sheetsUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      console.log('OAuth data fetch failed:', response.status);
      return null;
    }

    const data = await response.json();
    const values = data.values || [];
    
    if (values.length === 0) return [];

    // Convert to objects
    const headers = values[0];
    const rows = [];
    
    for (let i = 1; i < values.length; i++) {
      const row: any = {};
      headers.forEach((header: string, index: number) => {
        row[header.trim()] = values[i]?.[index] || '';
      });
      rows.push(row);
    }

    console.log(`Fetched ${rows.length} rows via OAuth API`);
    return rows;
  } catch (error) {
    console.error('OAuth fetch error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse(
        'Please sign in to access your Google Sheets data',
        'AUTH_REQUIRED',
        401
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate user session
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse(
        'Your session has expired. Please sign in again',
        'SESSION_EXPIRED',
        401,
        userError?.message
      );
    }

    // Parse request body
    let configuration_id: string;
    try {
      const body = await req.json();
      configuration_id = body.configuration_id;
      if (!configuration_id) {
        return errorResponse(
          'Sheet configuration ID is required',
          'INVALID_REQUEST',
          400
        );
      }
    } catch {
      return errorResponse(
        'Invalid request format',
        'INVALID_REQUEST',
        400
      );
    }

    // Fetch the configuration (shared across all authenticated team members)
    const { data: config, error: configError } = await supabase
      .from('sheet_configurations')
      .select('*')
      .eq('id', configuration_id)
      .eq('is_active', true)
      .single();

    if (configError || !config) {
      return errorResponse(
        'This sheet connection is no longer active. Please reconnect your sheet in Settings',
        'CONFIG_NOT_FOUND',
        404,
        configError?.message
      );
    }

    // Extract sheet ID from URL
    const sheetId = extractSheetId(config.sheet_url);
    if (!sheetId) {
      return errorResponse(
        'The Google Sheet URL appears to be invalid. Please check your configuration in Settings',
        'INVALID_SHEET_URL',
        400
      );
    }

    const gid = extractGid(config.sheet_url);
    let rows: any[] | null = null;

    // Try OAuth first (works for private sheets)
    const accessToken = await getValidAccessToken(supabase, user.id);
    if (accessToken) {
      console.log('Attempting OAuth fetch for private sheet...');
      rows = await fetchSheetDataWithOAuth(accessToken, sheetId, gid || undefined);
    }

    // Fallback to public CSV export if OAuth fails or no credentials
    if (!rows) {
      console.log('Falling back to public CSV export...');
      let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      if (gid) {
        csvUrl += `&gid=${gid}`;
        console.log(`Fetching specific tab with gid=${gid}`);
      }
      
      const csvResponse = await fetch(csvUrl);
      if (!csvResponse.ok) {
        if (csvResponse.status === 404) {
          return errorResponse(
            'The Google Sheet could not be found. It may have been deleted or moved',
            'SHEET_ACCESS_DENIED',
            502
          );
        }
        return errorResponse(
          'Unable to access the Google Sheet. Make sure it\'s set to "Anyone with the link can view" or connect your Google account in Settings',
          'SHEET_ACCESS_DENIED',
          502,
          `Google returned status ${csvResponse.status}`
        );
      }

      const csvText = await csvResponse.text();
      
      if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
        return errorResponse(
          'Unable to access the Google Sheet. Make sure it\'s set to "Anyone with the link can view" or connect your Google account in Settings',
          'SHEET_ACCESS_DENIED',
          502,
          'Received HTML instead of CSV data'
        );
      }
      
      console.log(`Fetched CSV from sheet ${sheetId}, length: ${csvText.length} chars`);
      rows = parseCsv(csvText);
    }
    
    console.log(`Parsed ${rows.length} rows`);

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
    console.error('Unexpected error in google-sheets-live:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(
      'Something went wrong while syncing your sheet. Please try again',
      'INTERNAL_ERROR',
      500,
      message
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
