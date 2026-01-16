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
  | 'GOOGLE_API_ERROR'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR';

function errorResponse(
  requestId: string,
  message: string, 
  code: ErrorCode, 
  status: number,
  details?: string
): Response {
  console.error(`[${requestId}] Error [${code}]: ${message}`, details ? `- ${details}` : '');
  return new Response(
    JSON.stringify({ 
      requestId,
      error: message, 
      code, 
      status,
      ...(details && { details: details.slice(0, 500) })
    }),
    { 
      status, 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'x-request-id': requestId,
      } 
    }
  );
}

function successResponse(requestId: string, data: any): Response {
  return new Response(
    JSON.stringify({ ...data, requestId }),
    { 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'x-request-id': requestId,
      } 
    }
  );
}

// Timed fetch wrapper for debugging
async function fetchWithDebug(
  requestId: string,
  target: string,
  url: string,
  options: RequestInit
): Promise<Response> {
  const start = Date.now();
  console.log(`[${requestId}] → ${target}: ${options.method || 'GET'} ${url.slice(0, 100)}...`);
  
  try {
    const response = await fetch(url, options);
    const duration = Date.now() - start;
    console.log(`[${requestId}] ← ${target}: ${response.status} (${duration}ms)`);
    return response;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[${requestId}] ✗ ${target}: Network error after ${duration}ms`, error);
    throw error;
  }
}

// Refresh Google OAuth access token
async function refreshAccessToken(
  requestId: string,
  supabase: any, 
  userId: string, 
  credentials: any
): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_SHEETS_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured');
  }

  console.log(`[${requestId}] Refreshing access token...`);

  const response = await fetchWithDebug(
    requestId,
    'Google OAuth',
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credentials.refresh_token,
        grant_type: 'refresh_token',
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${requestId}] Token refresh failed:`, errorText.slice(0, 300));
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

  console.log(`[${requestId}] Token refreshed successfully`);
  return tokens.access_token;
}

// Get valid access token (refresh if needed)
async function getValidAccessToken(requestId: string, supabase: any, userId: string): Promise<string | null> {
  const { data: credentials, error } = await supabase
    .from('google_sheets_credentials')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !credentials) {
    console.log(`[${requestId}] No Google credentials found`);
    return null;
  }

  const expiresAt = new Date(credentials.expires_at);
  const now = new Date(Date.now() + 60000);

  if (expiresAt <= now) {
    try {
      return await refreshAccessToken(requestId, supabase, userId, credentials);
    } catch (e) {
      console.log(`[${requestId}] Token refresh failed, will try public fallback`);
      return null;
    }
  }

  console.log(`[${requestId}] Using existing valid access token`);
  return credentials.access_token;
}

// Fetch sheet data using OAuth (for private sheets)
async function fetchSheetDataWithOAuth(
  requestId: string,
  accessToken: string,
  spreadsheetId: string,
  gid?: string
): Promise<any[] | null> {
  try {
    // Get sheet name from gid
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
    const metaResponse = await fetchWithDebug(
      requestId,
      'Google Sheets Meta',
      metaUrl,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!metaResponse.ok) {
      console.log(`[${requestId}] OAuth metadata fetch failed: ${metaResponse.status}`);
      return null;
    }

    const metadata = await metaResponse.json();
    const sheets = metadata.sheets || [];

    let sheetName = 'Sheet1';
    if (gid) {
      const sheet = sheets.find((s: any) => String(s.properties.sheetId) === gid);
      if (sheet) {
        sheetName = sheet.properties.title;
        console.log(`[${requestId}] Using sheet: "${sheetName}" (gid=${gid})`);
      }
    } else if (sheets.length > 0) {
      sheetName = sheets[0].properties.title;
      console.log(`[${requestId}] Using first sheet: "${sheetName}"`);
    }

    // Fetch data
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'`)}`;
    const response = await fetchWithDebug(
      requestId,
      'Google Sheets Data',
      sheetsUrl,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      console.log(`[${requestId}] OAuth data fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const values = data.values || [];
    
    if (values.length === 0) {
      console.log(`[${requestId}] Sheet is empty`);
      return [];
    }

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

    console.log(`[${requestId}] OAuth fetch success: ${rows.length} rows, ${headers.length} columns`);
    return rows;
  } catch (error) {
    console.error(`[${requestId}] OAuth fetch exception:`, error);
    return null;
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(requestId, 'Please sign in to access your Google Sheets data', 'AUTH_REQUIRED', 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate user session
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return errorResponse(requestId, 'Your session has expired. Please sign in again', 'SESSION_EXPIRED', 401, userError?.message);
    }

    console.log(`[${requestId}] Request from user: ${user.id.slice(0, 8)}...`);

    // Parse request body
    let configuration_id: string;
    try {
      const body = await req.json();
      configuration_id = body.configuration_id;
      if (!configuration_id) {
        return errorResponse(requestId, 'Sheet configuration ID is required', 'INVALID_REQUEST', 400);
      }
    } catch {
      return errorResponse(requestId, 'Invalid request format', 'INVALID_REQUEST', 400);
    }

    console.log(`[${requestId}] Fetching config: ${configuration_id}`);

    // Fetch the configuration
    const { data: config, error: configError } = await supabase
      .from('sheet_configurations')
      .select('*')
      .eq('id', configuration_id)
      .eq('is_active', true)
      .single();

    if (configError || !config) {
      return errorResponse(requestId, 'This sheet connection is no longer active. Please reconnect your sheet in Settings', 'CONFIG_NOT_FOUND', 404, configError?.message);
    }

    console.log(`[${requestId}] Config found: sheet_type=${config.sheet_type}, url=${config.sheet_url.slice(0, 50)}...`);

    // Extract sheet ID from URL
    const sheetId = extractSheetId(config.sheet_url);
    if (!sheetId) {
      return errorResponse(requestId, 'The Google Sheet URL appears to be invalid. Please check your configuration in Settings', 'INVALID_SHEET_URL', 400);
    }

    const gid = extractGid(config.sheet_url);
    let rows: any[] | null = null;

    console.log(`[${requestId}] Parsed: spreadsheetId=${sheetId}, gid=${gid || 'none'}`);

    // Try OAuth first (works for private sheets)
    const accessToken = await getValidAccessToken(requestId, supabase, user.id);
    if (accessToken) {
      console.log(`[${requestId}] Attempting OAuth fetch...`);
      rows = await fetchSheetDataWithOAuth(requestId, accessToken, sheetId, gid || undefined);
    }

    // Fallback to public CSV export if OAuth fails or no credentials
    if (!rows) {
      console.log(`[${requestId}] Falling back to public CSV export...`);
      let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      if (gid) {
        csvUrl += `&gid=${gid}`;
      }
      
      const csvResponse = await fetchWithDebug(requestId, 'Google Sheets CSV', csvUrl, { method: 'GET' });
      
      if (!csvResponse.ok) {
        if (csvResponse.status === 404) {
          return errorResponse(requestId, 'The Google Sheet could not be found. It may have been deleted or moved', 'SHEET_ACCESS_DENIED', 502);
        }
        return errorResponse(requestId, 'Unable to access the Google Sheet. Make sure it\'s set to "Anyone with the link can view" or connect your Google account in Settings', 'SHEET_ACCESS_DENIED', 502, `Google returned status ${csvResponse.status}`);
      }

      const csvText = await csvResponse.text();
      
      if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
        return errorResponse(requestId, 'Unable to access the Google Sheet. Make sure it\'s set to "Anyone with the link can view" or connect your Google account in Settings', 'SHEET_ACCESS_DENIED', 502, 'Received HTML instead of CSV data');
      }
      
      console.log(`[${requestId}] CSV fetch success: ${csvText.length} chars`);
      rows = parseCsv(csvText);
    }
    
    console.log(`[${requestId}] Parsed ${rows.length} rows`);

    // Transform data based on sheet type
    const transformedData = rows.map((row, index) => {
      const record: any = { _rowNumber: index + 2 };

      Object.keys(row).forEach(key => {
        const normalizedKey = normalizeColumnName(key);
        record[normalizedKey] = row[key];
      });

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
          record.setter_name = record.setter_name || record.setter || record.set_by;
          record.closer_name = record.closer_name || record.closer || record.closer_assigned;
          record.status = normalizeAppointmentStatus(record.status || record.call_status);
          // Form compliance tracking - checkmark/TRUE = filled, empty/null = not filled
          // Support multiple column name variants for auto-detection
          record.post_set_form_filled = !!(
            record.post_set_form_filled || record.post_set_form || record.postsetter_form ||
            record.post_setter_form || record.postsetform || record.post_set
          );
          record.closer_form_filled = !!(
            record.closer_form_filled || record.closer_form || record.closer_form_status ||
            record.closerformfilled || record.closer_form_completed || record.post_call_form_filled
          );
          break;

        case 'calls':
          record.call_id = record.call_id || record.id || `call-${index}`;
          record.lead_name = record.lead_name || record.name || record.full_name;
          record.lead_email = record.lead_email || record.email;
          record.call_time = record.call_time || record.created_at || record.date;
          record.setter_name = record.setter_name || record.setter || record.set_by;
          record.closer_name = record.closer_name || record.closer || record.closer_assigned;
          record.status = normalizeCallStatus(record.status || record.call_status);
          record.duration_seconds = parseInt(record.duration_seconds || record.duration || '0') || 0;
          record.call_notes = record.call_notes || record.notes;
          // Form compliance tracking - checkmark/TRUE = filled, empty/null = not filled
          // Support multiple column name variants for auto-detection
          record.post_set_form_filled = !!(
            record.post_set_form_filled || record.post_set_form || record.postsetter_form ||
            record.post_setter_form || record.postsetform || record.post_set
          );
          record.closer_form_filled = !!(
            record.closer_form_filled || record.closer_form || record.closer_form_status ||
            record.closerformfilled || record.closer_form_completed || record.post_call_form_filled
          );
          break;

        case 'deals':
          record.deal_id = record.deal_id || record.id || `deal-${index}`;
          record.lead_name = record.lead_name || record.name || record.full_name;
          record.lead_email = record.lead_email || record.email;
          record.setter_name = record.setter_name || record.setter || record.set_by;
          record.closer_name = record.closer_name || record.closer || record.closer_assigned;
          
          // Call Status - critical for shows/no-shows/close tracking
          record.call_status = record.call_status || record.deal_status || record.status || record.outcome || '';
          record.deal_status = record.call_status; // Alias for compatibility
          record.stage = normalizeDealStage(record.stage || record.call_status);
          
          // Revenue fields - handle currency symbols and commas
          record.revenue_amount = parseFloat(
            String(record.revenue_amount || record.revenue || record.revenue_generated || record.amount || '0')
              .replace(/[$,]/g, '')
          ) || 0;
          
          record.cash_collected = parseFloat(
            String(record.cash_collected || '0').replace(/[$,]/g, '')
          ) || 0;
          
          record.cash_after_fees = parseFloat(
            String(record.cash_after_fees || record.cash_collected_after_fees || '0')
              .replace(/[$,]/g, '')
          ) || 0;
          
          record.fees_amount = parseFloat(
            String(record.fees_amount || record.fees || record.processing_fees || '0')
              .replace(/[$,]/g, '')
          ) || 0;
          
          record.payment_platform = record.payment_platform || record.payment_type || record.payment_method;
          record.currency = record.currency || 'USD';
          record.close_date = record.close_date || record.closed_at || record.timestamp;
          record.recording_url = record.recording_url || record.call_recording || record.call_recording_fathom;
          break;
      }

      return record;
    });

    // Filter out deleted/empty records
    const validRecords = transformedData.filter(record => {
      if (record.is_deleted === 'true' || record.is_deleted === true) return false;
      
      if (config.sheet_type !== 'team') {
        const hasName = record.full_name || record.lead_name || record.name;
        const hasEmail = record.email || record.lead_email;
        if (!hasName && !hasEmail) return false;
      }
      
      return true;
    });

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Complete: ${validRecords.length}/${transformedData.length} valid records (${duration}ms)`);

    // Update last_synced_at
    await supabase
      .from('sheet_configurations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', configuration_id);

    return successResponse(requestId, { 
      data: validRecords,
      sheet_type: config.sheet_type,
      row_count: validRecords.length 
    });

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Unexpected error after ${duration}ms:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(requestId, 'Something went wrong while syncing your sheet. Please try again', 'INTERNAL_ERROR', 500, message);
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
  return 'setter';
}

function normalizeLeadStatus(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s.includes('qualified')) return 'qualified';
  if (s.includes('unqualified')) return 'unqualified';
  if (s.includes('contact')) return 'contacted';
  return 'new';
}

function normalizeAppointmentStatus(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('no') && s.includes('show')) return 'no_show';
  if (s.includes('resch')) return 'rescheduled';
  if (s.includes('complete') || s.includes('done') || s.includes('closed')) return 'completed';
  return 'scheduled';
}

function normalizeCallStatus(status: string): string {
  const s = (status || '').toLowerCase().trim();
  if (s.includes('connect') || s.includes('live') || s.includes('answer')) return 'connected';
  if (s.includes('no') && s.includes('answer')) return 'no_answer';
  if (s.includes('voice') || s.includes('vm')) return 'voicemail';
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
