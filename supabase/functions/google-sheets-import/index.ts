import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Error codes for structured responses
type ErrorCode = 
  | 'AUTH_REQUIRED'
  | 'INVALID_REQUEST'
  | 'GOOGLE_ACCESS_DENIED'
  | 'GOOGLE_NOT_FOUND'
  | 'GOOGLE_API_ERROR'
  | 'AI_GATEWAY_ERROR'
  | 'PARSE_ERROR'
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

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    
    console.log(`[${requestId}] Auth header check:`, {
      hasHeader: !!authHeader,
      startsWithBearer: authHeader.startsWith('Bearer '),
      headerLength: authHeader.length,
      headerPrefix: authHeader.slice(0, 50) + (authHeader.length > 50 ? '...' : ''),
    });
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error(`[${requestId}] Missing or invalid Authorization header`);
      return errorResponse(requestId, 'Missing or invalid Authorization header', 'AUTH_REQUIRED', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    console.log(`[${requestId}] Extracted token:`, {
      tokenLength: token.length,
      tokenPrefix: token.slice(0, 30) + '...',
      tokenSuffix: '...' + token.slice(-10),
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    console.log(`[${requestId}] Creating Supabase client:`, {
      url: supabaseUrl,
      hasAnonKey: !!supabaseKey,
      anonKeyPrefix: supabaseKey?.slice(0, 20) + '...' || 'none',
    });
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

<<<<<<< HEAD
    console.log(`[${requestId}] Calling supabase.auth.getUser()...`);
=======
    console.log(`[${requestId}] Calling getUser() to validate token...`);
    const getUserStart = Date.now();
>>>>>>> c633333 (Enhance authentication logging and error handling)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const getUserDuration = Date.now() - getUserStart;
    
    console.log(`[${requestId}] getUser() result (${getUserDuration}ms):`, {
      hasUser: !!user,
      userId: user?.id?.slice(0, 8) + '...' || 'none',
      userEmail: user?.email?.slice(0, 30) || 'none',
      hasError: !!userError,
      errorMessage: userError?.message || 'none',
      errorStatus: userError?.status || 'none',
      errorName: userError?.name || 'none',
    });
    
    if (userError || !user) {
      console.error(`[${requestId}] getUser() failed or returned no user:`, {
        errorMessage: userError?.message,
        errorStatus: userError?.status,
        errorName: userError?.name,
        hasUser: !!user,
      });
      return errorResponse(requestId, 'Unauthorized', 'AUTH_REQUIRED', 401, userError?.message || 'No user found');
    }
    
    console.log(`[${requestId}] User authenticated: ${user.id.slice(0, 8)}...`);

    const userId = user.id;
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    console.log(`[${requestId}] Request: action=${action}, userId=${userId.slice(0, 8)}...`);

    if (action === 'analyze') {
      return await analyzeSheet(requestId, req, supabase, userId);
    } else if (action === 'import') {
      return await executeImport(requestId, req, supabase, userId);
    } else {
      return errorResponse(requestId, 'Invalid action parameter', 'INVALID_REQUEST', 400);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Unexpected error after ${duration}ms:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(requestId, errorMessage, 'INTERNAL_ERROR', 500);
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
    throw new Error('Google OAuth not configured. Please contact support.');
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
    console.error(`[${requestId}] Token refresh failed:`, errorText.slice(0, 500));
    throw new Error('Failed to refresh Google credentials. Please reconnect your Google account in Settings.');
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
async function getValidAccessToken(requestId: string, supabase: any, userId: string): Promise<string> {
  const { data: credentials, error } = await supabase
    .from('google_sheets_credentials')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !credentials) {
    console.log(`[${requestId}] No Google credentials found for user`);
    throw new Error('Google account not connected. Please connect your Google account in Settings.');
  }

  const expiresAt = new Date(credentials.expires_at);
  const now = new Date(Date.now() + 60000); // 1 min buffer

  if (expiresAt <= now) {
    console.log(`[${requestId}] Access token expired, refreshing...`);
    return await refreshAccessToken(requestId, supabase, userId, credentials);
  }

  console.log(`[${requestId}] Using existing valid access token`);
  return credentials.access_token;
}

// Convert sheet name/gid to A1 range for API call
async function getSheetRange(requestId: string, accessToken: string, spreadsheetId: string, gid?: string): Promise<string> {
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
  
  const response = await fetchWithDebug(
    requestId,
    'Google Sheets Metadata',
    metaUrl,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${requestId}] Failed to get sheet metadata:`, errorText.slice(0, 500));
    
    if (response.status === 403) {
      throw new Error('ACCESS_DENIED: You don\'t have permission to access this Google Sheet.');
    }
    if (response.status === 404) {
      throw new Error('NOT_FOUND: This Google Sheet could not be found.');
    }
    throw new Error('Failed to access Google Sheet metadata.');
  }

  const metadata = await response.json();
  const sheets = metadata.sheets || [];

  console.log(`[${requestId}] Found ${sheets.length} sheets in spreadsheet`);

  if (gid) {
    const sheet = sheets.find((s: any) => String(s.properties.sheetId) === gid);
    if (sheet) {
      console.log(`[${requestId}] Using sheet: "${sheet.properties.title}" (gid=${gid})`);
      return `'${sheet.properties.title}'`;
    }
    console.log(`[${requestId}] gid=${gid} not found, using first sheet`);
  }

  if (sheets.length > 0) {
    console.log(`[${requestId}] Using first sheet: "${sheets[0].properties.title}"`);
    return `'${sheets[0].properties.title}'`;
  }

  return 'Sheet1';
}

// Fetch sheet data using OAuth (works for private sheets)
async function fetchSheetDataWithAuth(
  requestId: string,
  supabase: any, 
  userId: string, 
  spreadsheetId: string, 
  gid?: string,
  maxRows?: number
): Promise<any[]> {
  const accessToken = await getValidAccessToken(requestId, supabase, userId);
  const sheetRange = await getSheetRange(requestId, accessToken, spreadsheetId, gid);
  
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetRange)}`;
  
  const response = await fetchWithDebug(
    requestId,
    'Google Sheets Data',
    sheetsUrl,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${requestId}] Failed to fetch sheet data:`, errorText.slice(0, 500));
    
    if (response.status === 403) {
      throw new Error('ACCESS_DENIED: Access denied to Google Sheet. Please ensure the sheet is shared with your Google account.');
    }
    if (response.status === 404) {
      throw new Error('NOT_FOUND: Google Sheet not found. It may have been deleted or moved.');
    }
    
    throw new Error(`GOOGLE_API_ERROR: Failed to fetch sheet data (${response.status})`);
  }

  const data = await response.json();
  const values = data.values || [];
  
  if (values.length === 0) {
    throw new Error('Sheet is empty');
  }

  const headers = values[0];
  const rows = [];
  const endIndex = maxRows ? Math.min(maxRows + 1, values.length) : values.length;
  
  for (let i = 1; i < endIndex; i++) {
    const row: any = {};
    headers.forEach((header: string, index: number) => {
      row[header.trim()] = values[i]?.[index] || '';
    });
    rows.push(row);
  }

  console.log(`[${requestId}] Fetched ${rows.length} rows via Sheets API (${headers.length} columns)`);
  return rows;
}

function parseCsv(csvText: string): any[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

function mapToSourceEnum(value: string): string {
  if (!value) return 'other';
  const normalized = value.toLowerCase().trim();
  
  if (normalized.includes('website') || normalized.includes('web') || normalized.includes('site')) return 'website';
  if (normalized.includes('referral') || normalized.includes('refer')) return 'referral';
  if (normalized.includes('social') || normalized.includes('facebook') || normalized.includes('instagram') || 
      normalized.includes('twitter') || normalized.includes('linkedin') || normalized.includes('tiktok')) return 'social_media';
  if (normalized.includes('ad') || normalized.includes('paid') || normalized.includes('ppc') || 
      normalized.includes('google ads') || normalized.includes('facebook ads')) return 'paid_ad';
  
  return 'other';
}

function mapToStatusEnum(value: string): string {
  if (!value) return 'new';
  const normalized = value.toLowerCase().trim();
  
  if (normalized.includes('qualified') || normalized === 'qual') return 'qualified';
  if (normalized.includes('unqualified') || normalized.includes('no show') || normalized === 'no-show') return 'unqualified';
  if (normalized.includes('contact')) return 'contacted';
  
  return 'new';
}

async function analyzeSheet(requestId: string, req: Request, supabase: any, userId: string) {
  const { sheetUrl } = await req.json();

  console.log(`[${requestId}] Analyzing sheet: ${sheetUrl}`);

  const spreadsheetId = extractSheetId(sheetUrl);
  const gid = extractGid(sheetUrl);
  
  if (!spreadsheetId) {
    return errorResponse(requestId, 'Invalid Google Sheets URL', 'INVALID_REQUEST', 400);
  }

  console.log(`[${requestId}] Parsed: spreadsheetId=${spreadsheetId}, gid=${gid}`);

  // Fetch first 5 rows for analysis using OAuth
  let rows: any[];
  try {
    rows = await fetchSheetDataWithAuth(requestId, supabase, userId, spreadsheetId, gid || undefined, 5);
  } catch (error: any) {
    const message = error.message || 'Unknown error';
    if (message.includes('ACCESS_DENIED')) {
      return errorResponse(requestId, 'Access denied to this Google Sheet', 'GOOGLE_ACCESS_DENIED', 403, message);
    }
    if (message.includes('NOT_FOUND')) {
      return errorResponse(requestId, 'Google Sheet not found', 'GOOGLE_NOT_FOUND', 404, message);
    }
    return errorResponse(requestId, 'Failed to fetch Google Sheet data', 'GOOGLE_API_ERROR', 502, message);
  }
  
  if (rows.length === 0) {
    return errorResponse(requestId, 'Sheet is empty', 'INVALID_REQUEST', 400);
  }
  
  const headers = Object.keys(rows[0]);
  const sampleRows = rows.slice(0, 3);

  console.log(`[${requestId}] Headers (${headers.length}):`, headers.slice(0, 10).join(', '));
  console.log(`[${requestId}] Sample rows: ${sampleRows.length}`);

  // Use Lovable AI to analyze and suggest mappings
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    return errorResponse(requestId, 'AI service not configured', 'INTERNAL_ERROR', 500);
  }

  const systemPrompt = `You are a data mapping expert. Analyze this Google Sheet and suggest field mappings for a sales CRM tracking leads → appointments → calls → deals.

CRITICAL: THIS SHEET STRUCTURE IS THE ABSOLUTE STANDARD FOR ALL MAPPINGS.
The user's sheet contains these EXACT columns that map to a complete sales funnel:

SHEET TYPE DETECTION:
1. If you see columns like "Booking Time", "Appointment Date", "Call Status", "Revenue", "Closer Assigned" → this is "appointments" type
   This single sheet tracks the ENTIRE sales funnel from lead → appointment → call → deal in one view.
2. If you see columns like "Full Name", "Email", "Role", "Phone" WITHOUT appointment/booking fields → this is "team" type
   This sheet tracks team members/profiles (closers, setters, admins).
3. Otherwise → this is "leads" type

EXACT COLUMN MAPPINGS (match these precisely):

LEAD IDENTIFICATION FIELDS:
- "Lead Name" / "Name" → dbField: "name" (leads.name)
- "Email" → dbField: "email" (leads.email)
- "Phone" → dbField: "phone" (leads.phone)
- "UTM Source" / "Source" → dbField: "utm_source" (leads.utm_source) - store raw value
- "Set By" / "Setter" → dbField: "setter_name" (custom_fields.setter_name) - will lookup profile

APPOINTMENT FIELDS:
- "Booking Time" / "Booked At" → dbField: "booked_at" (appointments.booked_at)
- "Appointment Date" + "Appointment Time" + "Raw Date" → dbField: "scheduled_at" (appointments.scheduled_at) - COMBINE THESE
- "Closer Assigned" / "Closer" → dbField: "closer_name" (custom_fields.closer_name) - will lookup profile
- "Set By" / "Setter" → dbField: "setter_name" (custom_fields.setter_name)
- "Recording" / "Recording URL" → dbField: "recording_url" (appointments.recording_url) - SKIP if value is "IN CRM"
- "Post Call Form" / "Form" → dbField: "post_call_form_url" (appointments.post_call_form_url)
- "Call Notes" / "Notes" → dbField: "notes" (appointments.notes)
- "Closer Form Filled" → dbField: "closer_form_status" (appointments.closer_form_status)
- "Pipeline" → dbField: "pipeline" (appointments.pipeline)

STATUS MAPPING (CRITICAL):
- "Call Status" / "Status" / "Result" → dbField: "call_status" (custom_fields.call_status)

TEAM/PROFILES FIELDS (for sheet_type: "team"):
- "Full Name" / "Name" → dbField: "full_name" (profiles.full_name) - required
- "Email" → dbField: "email" (profiles.email) - required
- "Role" / "Position" / "Title" → dbField: "role" (profiles.role) - map to enum: 'setter', 'closer', 'admin'
- "Phone" / "Phone Number" → dbField: "phone" (profiles.phone)

CRITICAL RULES:
1. Return ONLY valid JSON (no markdown code blocks)
2. Use camelCase for all keys: sheetColumn, dbField, customFieldKey
3. confidence MUST be a NUMBER 0-100
4. For date/time fields that need combining, set transformation: "combine_datetime"
5. For name lookups (closers/setters), set transformation: "lookup_profile"
6. If dbField is "custom_fields", you MUST include customFieldKey

RETURN THIS EXACT JSON STRUCTURE:
{
  "sheet_type": "appointments" | "team" | "leads",
  "mappings": [
    {
      "sheetColumn": "Booking Time",
      "dbField": "booked_at",
      "confidence": 95,
      "transformation": "none"
    }
  ],
  "warnings": ["Data quality issues or mapping concerns"],
  "suggestedDefaults": {
    "source": "other",
    "status": "scheduled"
  }
}`;

  const userPrompt = `Column headers from Google Sheet: ${JSON.stringify(headers)}

Sample data (first 3 rows):
${JSON.stringify(sampleRows, null, 2)}`;

  console.log(`[${requestId}] Calling AI gateway for analysis...`);

  const aiResponse = await fetchWithDebug(
    requestId,
    'AI Gateway',
    'https://ai.gateway.lovable.dev/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
      }),
    }
  );

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error(`[${requestId}] AI API error:`, errorText.slice(0, 500));
    return errorResponse(requestId, 'Failed to analyze sheet with AI', 'AI_GATEWAY_ERROR', 502, `Status: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const aiContent = aiData.choices?.[0]?.message?.content;
  
  if (!aiContent) {
    console.error(`[${requestId}] AI returned empty content:`, JSON.stringify(aiData).slice(0, 500));
    return errorResponse(requestId, 'AI returned empty analysis', 'AI_GATEWAY_ERROR', 502);
  }

  console.log(`[${requestId}] AI Response (${aiContent.length} chars):`, aiContent.slice(0, 200));

  // Parse AI response
  let analysisResult;
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : aiContent;
    analysisResult = JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[${requestId}] Failed to parse AI response:`, e, aiContent.slice(0, 500));
    return errorResponse(requestId, 'Failed to parse AI analysis', 'PARSE_ERROR', 500, 'AI response was not valid JSON');
  }

  // Normalize AI response
  analysisResult.mappings = (analysisResult.mappings || []).map((mapping: any) => {
    const sheetColumn = mapping.sheetColumn || mapping.sheet_column;
    const dbField = mapping.dbField || mapping.db_field;
    const customFieldKey = mapping.customFieldKey || mapping.custom_field_key;
    
    let confidence = mapping.confidence;
    if (typeof confidence === 'string') {
      confidence = confidence === 'high' ? 90 : confidence === 'medium' ? 60 : 30;
    }
    
    return {
      sheetColumn,
      dbField,
      confidence: confidence || 50,
      transformation: mapping.transformation || 'none',
      customFieldKey,
      sampleValue: sampleRows[0]?.[sheetColumn] || '',
    };
  });

  const result = {
    sheetId: spreadsheetId,
    headers,
    totalRows: rows.length,
    sheet_type: analysisResult.sheet_type || 'leads',
    analysis: {
      mappings: analysisResult.mappings,
      warnings: analysisResult.warnings || [],
      suggestedDefaults: analysisResult.suggestedDefaults || {},
    },
    sampleRows: sampleRows.slice(0, 2),
  };

  console.log(`[${requestId}] Analysis complete: sheet_type=${result.sheet_type}, mappings=${result.analysis.mappings.length}`);
  return successResponse(requestId, result);
}

async function executeImport(requestId: string, req: Request, supabase: any, userId: string) {
  const { sheetUrl, mappings, defaults = {}, sheetType } = await req.json();

  console.log(`[${requestId}] Starting import: sheetType=${sheetType}, mappings=${mappings?.length}`);

  if (sheetType === 'team') {
    return await executeTeamImport(requestId, req, supabase, userId, sheetUrl, mappings, defaults);
  }

  const spreadsheetId = extractSheetId(sheetUrl);
  const gid = extractGid(sheetUrl);

  if (!spreadsheetId) {
    return errorResponse(requestId, 'Invalid Google Sheets URL', 'INVALID_REQUEST', 400);
  }

  let rows: any[];
  try {
    rows = await fetchSheetDataWithAuth(requestId, supabase, userId, spreadsheetId, gid || undefined);
  } catch (error: any) {
    const message = error.message || 'Unknown error';
    if (message.includes('ACCESS_DENIED')) {
      return errorResponse(requestId, 'Access denied to this Google Sheet', 'GOOGLE_ACCESS_DENIED', 403, message);
    }
    return errorResponse(requestId, 'Failed to fetch Google Sheet data', 'GOOGLE_API_ERROR', 502, message);
  }

  console.log(`[${requestId}] Fetched ${rows.length} rows for import`);

  const leadsToInsert: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lead: any = {
      source: defaults.source || 'other',
      status: defaults.status || 'new',
    };

    for (const mapping of mappings) {
      if (!mapping.dbField || mapping.dbField === 'ignore') continue;
      
      const value = row[mapping.sheetColumn];
      if (!value) continue;

      if (mapping.dbField === 'source') {
        lead.source = mapToSourceEnum(value);
      } else if (mapping.dbField === 'status') {
        lead.status = mapToStatusEnum(value);
      } else if (mapping.dbField === 'custom_fields') {
        if (!lead.custom_fields) lead.custom_fields = {};
        const key = mapping.customFieldKey || mapping.sheetColumn.toLowerCase().replace(/\s+/g, '_');
        lead.custom_fields[key] = value;
      } else {
        lead[mapping.dbField] = value;
      }
    }

    if (!lead.name || !lead.email) {
      errors.push({ row: i + 2, message: 'Missing required fields (name or email)' });
      continue;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lead.email)) {
      errors.push({ row: i + 2, message: `Invalid email format: ${lead.email}` });
      continue;
    }

    leadsToInsert.push(lead);
  }

  console.log(`[${requestId}] Validated ${leadsToInsert.length} leads, ${errors.length} errors`);

  if (leadsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('leads')
      .insert(leadsToInsert);

    if (insertError) {
      console.error(`[${requestId}] Insert error:`, insertError);
      return errorResponse(requestId, 'Failed to insert leads', 'INTERNAL_ERROR', 500, insertError.message);
    }
  }

  await supabase.from('google_sheets_imports').insert({
    user_id: userId,
    sheet_id: spreadsheetId,
    sheet_url: sheetUrl,
    field_mappings: mappings,
    rows_imported: leadsToInsert.length,
    rows_failed: errors.length,
    errors: errors.length > 0 ? errors : null,
    sync_status: 'completed',
  });

  console.log(`[${requestId}] Import complete: ${leadsToInsert.length} imported, ${errors.length} failed`);

  return successResponse(requestId, {
    success: true,
    rowsImported: leadsToInsert.length,
    rowsFailed: errors.length,
    errors: errors.slice(0, 10),
  });
}

async function executeTeamImport(
  requestId: string,
  _req: Request, 
  supabase: any, 
  userId: string, 
  sheetUrl: string, 
  mappings: any[], 
  defaults: any = {}
) {
  console.log(`[${requestId}] Starting team import`);

  const spreadsheetId = extractSheetId(sheetUrl);
  const gid = extractGid(sheetUrl);

  if (!spreadsheetId) {
    return errorResponse(requestId, 'Invalid Google Sheets URL', 'INVALID_REQUEST', 400);
  }

  let rows: any[];
  try {
    rows = await fetchSheetDataWithAuth(requestId, supabase, userId, spreadsheetId, gid || undefined);
  } catch (error: any) {
    return errorResponse(requestId, 'Failed to fetch Google Sheet data', 'GOOGLE_API_ERROR', 502, error.message);
  }

  console.log(`[${requestId}] Fetched ${rows.length} team members`);

  const profilesToUpsert: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const profile: any = {};

    for (const mapping of mappings) {
      if (!mapping.dbField || mapping.dbField === 'ignore') continue;
      
      const value = row[mapping.sheetColumn];
      if (!value) continue;

      if (mapping.dbField === 'role') {
        const normalized = value.toLowerCase().trim();
        if (normalized.includes('admin') || normalized.includes('manager')) {
          profile.role = 'admin';
        } else if (normalized.includes('close')) {
          profile.role = 'closer';
        } else {
          profile.role = 'setter';
        }
      } else if (mapping.dbField === 'custom_fields') {
        if (!profile.sync_metadata) profile.sync_metadata = {};
        const key = mapping.customFieldKey || mapping.sheetColumn.toLowerCase().replace(/\s+/g, '_');
        profile.sync_metadata[key] = value;
      } else {
        profile[mapping.dbField] = value;
      }
    }

    if (!profile.email) {
      errors.push({ row: i + 2, message: 'Missing required email' });
      continue;
    }

    if (!profile.role) {
      profile.role = defaults.role || 'setter';
    }

    profilesToUpsert.push(profile);
  }

  console.log(`[${requestId}] Validated ${profilesToUpsert.length} profiles, ${errors.length} errors`);

  let upsertedCount = 0;
  for (const profile of profilesToUpsert) {
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', profile.email)
      .single();

    if (existingUser) {
      await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          role: profile.role,
          sync_metadata: profile.sync_metadata,
        })
        .eq('id', existingUser.id);
    }
    upsertedCount++;
  }

  await supabase.from('google_sheets_imports').insert({
    user_id: userId,
    sheet_id: spreadsheetId,
    sheet_url: sheetUrl,
    sheet_name: 'Team',
    field_mappings: mappings,
    rows_imported: upsertedCount,
    rows_failed: errors.length,
    errors: errors.length > 0 ? errors : null,
    sync_status: 'completed',
  });

  console.log(`[${requestId}] Team import complete: ${upsertedCount} upserted, ${errors.length} failed`);

  return successResponse(requestId, {
    success: true,
    rowsImported: upsertedCount,
    rowsFailed: errors.length,
    errors: errors.slice(0, 10),
  });
}
