import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      userId = payload?.sub || null;
    } catch (_e) {
      // Token decode failed
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'analyze') {
      return await analyzeSheet(req, supabase, userId);
    } else if (action === 'analyze-workbook') {
      return await analyzeWorkbook(req, supabase, userId);
    } else if (action === 'batch-import') {
      return await batchImport(req, supabase, userId);
    } else if (action === 'import') {
      const body = await req.json();
      const sheetType = body.sheetType || 'leads';
      
      if (sheetType === 'team_roster') {
        const { importTeamRoster } = await import('./team-roster-import.ts');
        return await importTeamRoster(req, supabase, userId, body);
      }
      
      return await executeImport(req, supabase, userId);
    } else {
      throw new Error('Invalid action parameter');
    }
  } catch (error) {
    console.error('Error in google-sheets-import:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractSheetId(sheetUrl: string): string | null {
  const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function fetchSheetData(sheetUrl: string, maxRows?: number): Promise<any[]> {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    throw new Error('Invalid Google Sheets URL');
  }

  // Use CSV export endpoint (works for public sheets)
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch sheet. Make sure the sheet is publicly accessible (Anyone with the link can view)');
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);
    
    if (rows.length === 0) {
      throw new Error('Sheet is empty');
    }

    return maxRows ? rows.slice(0, maxRows) : rows;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch sheet data: ${errorMessage}`);
  }
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

async function analyzeSheet(req: Request, supabase: any, userId: string) {
  const { sheetUrl } = await req.json();

  console.log('Analyzing sheet:', sheetUrl);

  // Fetch first 5 rows for analysis
  const rows = await fetchSheetData(sheetUrl, 6); // 1 header + 5 data rows
  const headers = Object.keys(rows[0]);
  const sampleRows = rows.slice(1, 4); // First 3 data rows

  console.log('Headers:', headers);
  console.log('Sample rows:', sampleRows);

  // Use Lovable AI to analyze and suggest mappings
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const systemPrompt = `You are a data mapping expert. Analyze this Google Sheet and suggest field mappings for a sales CRM tracking leads → appointments → calls → deals.

CRITICAL: THIS SHEET STRUCTURE IS THE ABSOLUTE STANDARD FOR ALL MAPPINGS.
The user's sheet contains these EXACT columns that map to a complete sales funnel:

SHEET TYPE DETECTION:
If you see columns like "Booking Time", "Appointment Date", "Call Status", "Revenue", "Closer Assigned" → this is "appointments" type
This single sheet tracks the ENTIRE sales funnel from lead → appointment → call → deal in one view.

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
  Map values to appointments.status:
  * "Closed" → status: 'completed' + CREATE DEAL
  * "No Close" → status: 'completed' + NO DEAL
  * "No Show" → status: 'no_show'
  * "Cancelled" → status: 'cancelled'
  * (other) → status: 'scheduled'

DEAL FIELDS (Only create deal if "Call Status" = "Closed"):
- "Revenue" → deals.revenue_amount (parse as number, strip $)
- "Cash Collected" → deals.cash_collected (parse as number, strip $)
- "Payment Platform" → deals.payment_platform
- Link to: lead_id, closer_id, setter_id, appointment_id
- Set: deals.status = 'won'

CRITICAL RULES:
1. Return ONLY valid JSON (no markdown code blocks)
2. Use camelCase for all keys: sheetColumn, dbField, customFieldKey
3. confidence MUST be a NUMBER 0-100
4. For date/time fields that need combining, set transformation: "combine_datetime"
5. For name lookups (closers/setters), set transformation: "lookup_profile"
6. For "IN CRM" or empty recordings, set transformation: "skip_if_placeholder"
7. For revenue/cash fields, set transformation: "parse_currency"
8. If dbField is "custom_fields", you MUST include customFieldKey

RETURN THIS EXACT JSON STRUCTURE:
{
  "sheet_type": "appointments",
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

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('AI API error:', aiResponse.status, errorText);
    throw new Error('Failed to analyze sheet with AI');
  }

  const aiData = await aiResponse.json();
  const aiContent = aiData.choices[0].message.content;
  
  console.log('AI Response:', aiContent);

  // Parse AI response (handle potential markdown code blocks)
  let analysisResult;
  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : aiContent;
    analysisResult = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    throw new Error('Failed to parse AI analysis');
  }

  // Normalize AI response to match frontend interface (handle both snake_case and camelCase)
  analysisResult.mappings = analysisResult.mappings.map((mapping: any) => {
    // Handle both snake_case and camelCase
    const sheetColumn = mapping.sheetColumn || mapping.sheet_column;
    const dbField = mapping.dbField || mapping.db_field;
    const customFieldKey = mapping.customFieldKey || mapping.custom_field_key;
    
    // Convert confidence string to number if needed
    let confidence = mapping.confidence;
    if (typeof confidence === 'string') {
      confidence = confidence === 'high' ? 90 : 
                   confidence === 'medium' ? 60 : 30;
    }
    
    return {
      sheetColumn,
      dbField,
      customFieldKey,
      confidence,
      transformation: mapping.transformation || 'none',
      sampleValue: sampleRows[0]?.[sheetColumn] || '',
    };
  });

  const sheetId = extractSheetId(sheetUrl);

  return new Response(
    JSON.stringify({
      sheetId,
      headers,
      totalRows: rows.length - 1,
      sheet_type: analysisResult.sheet_type,
      analysis: analysisResult,
      sampleRows: sampleRows.slice(0, 3),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function executeImport(req: Request, supabase: any, userId: string) {
  const { sheetUrl, mappings, defaults } = await req.json();

  console.log('Executing import for:', sheetUrl);
  console.log('Mappings:', mappings);

  // Fetch all rows
  const rows = await fetchSheetData(sheetUrl);
  const dataRows = rows.slice(1); // Skip header

  console.log(`Processing ${dataRows.length} rows`);

  const results = {
    imported: 0,
    failed: 0,
    errors: [] as any[],
  };

  const leadsToInsert = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    
    try {
      const lead: any = {};
      const customFields: Record<string, any> = {};

      // Apply mappings
      for (const mapping of mappings) {
        if (!mapping.dbField || mapping.dbField === 'ignore') continue;

        let value = row[mapping.sheetColumn];

        // Apply transformations
        if (value) {
          switch (mapping.transformation) {
            case 'trim':
              value = value.trim();
              break;
            case 'lowercase_trim':
              value = value.toLowerCase().trim();
              break;
            case 'clean_phone':
              value = value.replace(/[^\d+]/g, '');
              break;
            case 'map_to_enum':
              if (mapping.dbField === 'source') {
                value = mapToSourceEnum(value);
              } else if (mapping.dbField === 'status') {
                value = mapToStatusEnum(value);
              }
              break;
          }
        }

        // Auto-create profiles for team members
        if (mapping.customFieldKey === 'closerName' && value) {
          const profileId = await findOrCreateProfile(supabase, value, 'closer');
          if (profileId) lead.closer_id = profileId;
          customFields.closerName = value;
          continue;
        }
        
        if (mapping.customFieldKey === 'setterName' && value) {
          const profileId = await findOrCreateProfile(supabase, value, 'setter');
          if (profileId) lead.setter_id = profileId;
          customFields.setterName = value;
          continue;
        }

        // Route to standard field or custom fields
        if (mapping.dbField === 'custom_fields') {
          const fieldKey = mapping.customFieldKey || mapping.sheetColumn.toLowerCase().replace(/\s+/g, '_');
          customFields[fieldKey] = value || null;
        } else {
          lead[mapping.dbField] = value || null;
        }
      }

      // Add custom fields to lead object if any exist
      if (Object.keys(customFields).length > 0) {
        lead.custom_fields = customFields;
      }

      // Apply defaults
      if (defaults) {
        Object.keys(defaults).forEach(key => {
          if (!lead[key]) {
            lead[key] = defaults[key];
          }
        });
      }

      // Validate required fields
      if (!lead.name || !lead.email) {
        throw new Error('Missing required fields: name and email are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(lead.email)) {
        throw new Error('Invalid email format');
      }

      leadsToInsert.push(lead);
    } catch (error) {
      results.failed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push({
        row: i + 2, // +2 because: +1 for header, +1 for 1-based indexing
        data: row,
        error: errorMessage,
      });
    }
  }

  // Bulk insert leads
  if (leadsToInsert.length > 0) {
    console.log(`Inserting ${leadsToInsert.length} leads`);
    
    const { data: insertedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select();

    if (insertError) {
      console.error('Bulk insert error:', insertError);
      throw new Error(`Failed to insert leads: ${insertError.message}`);
    }

    results.imported = insertedLeads?.length || 0;
  }

  // Save import record
  const sheetId = extractSheetId(sheetUrl);
  await supabase.from('google_sheets_imports').insert({
    user_id: userId,
    sheet_url: sheetUrl,
    sheet_id: sheetId,
    field_mappings: { mappings, defaults },
    sync_status: 'completed',
    rows_imported: results.imported,
    rows_failed: results.failed,
    errors: results.errors,
    last_sync_at: new Date().toISOString(),
  });

  console.log('Import completed:', results);

  return new Response(
    JSON.stringify(results),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function findOrCreateProfile(supabase: any, name: string, role: 'closer' | 'setter'): Promise<string | null> {
  if (!name || typeof name !== 'string') return null;
  
  const normalizedName = name.trim();
  if (!normalizedName) return null;

  // Try to find existing profile by full_name (case-insensitive)
  const { data: existing, error: searchError } = await supabase
    .from('profiles')
    .select('id')
    .ilike('full_name', normalizedName)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  // Create new profile with service role (bypasses RLS)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

  // Generate a placeholder email from name
  const emailSlug = normalizedName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
  const generatedEmail = `${emailSlug}@team.internal`;

  const { data: newProfile, error: insertError } = await serviceSupabase
    .from('profiles')
    .insert({
      full_name: normalizedName,
      email: generatedEmail,
      role: role,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to create profile:', insertError);
    return null;
  }

  return newProfile.id;
}

async function analyzeWorkbook(req: Request, supabase: any, userId: string) {
  const { spreadsheetId, sheetNames } = await req.json();

  console.log('Analyzing workbook:', spreadsheetId, 'Sheets:', sheetNames);

  const workbookAnalysis = [];

  for (const sheetName of sheetNames) {
    try {
      // Construct sheet URL with sheet name
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;
      
      // Fetch first 5 rows for analysis
      const rows = await fetchSheetData(sheetUrl, 6);
      const headers = Object.keys(rows[0]);
      const sampleRows = rows.slice(1, 4);

      // Auto-detect sheet type based on headers
      const detectedType = detectSheetType(headers);
      const confidence = calculateConfidence(headers, detectedType);

      // Use AI to analyze mappings
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      const systemPrompt = `Analyze this Google Sheet and suggest field mappings for a ${detectedType} sheet in a sales CRM. Return JSON only with: { "mappings": [...], "warnings": [...], "suggestedDefaults": {...} }`;
      const userPrompt = `Sheet: "${sheetName}"\nHeaders: ${JSON.stringify(headers)}\nSample: ${JSON.stringify(sampleRows)}`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
      });

      const aiData = await aiResponse.json();
      const aiContent = aiData.choices[0].message.content;
      
      let analysisResult;
      try {
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : aiContent;
        analysisResult = JSON.parse(jsonStr);
      } catch (e) {
        analysisResult = { mappings: [], warnings: [], suggestedDefaults: {} };
      }

      workbookAnalysis.push({
        sheetName,
        sheetType: detectedType,
        confidence,
        headers,
        totalRows: rows.length - 1,
        mappings: analysisResult.mappings || [],
        warnings: analysisResult.warnings || [],
        suggestedDefaults: analysisResult.suggestedDefaults || {},
        sampleRows: sampleRows.slice(0, 3),
      });
    } catch (error) {
      console.error(`Failed to analyze sheet ${sheetName}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      workbookAnalysis.push({
        sheetName,
        sheetType: 'unknown',
        confidence: 0,
        headers: [],
        totalRows: 0,
        mappings: [],
        warnings: [`Failed to analyze: ${errorMessage}`],
        suggestedDefaults: {},
        sampleRows: [],
      });
    }
  }

  return new Response(
    JSON.stringify({ workbookAnalysis }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function detectSheetType(headers: string[]): string {
  const headerStr = headers.join(' ').toLowerCase();
  
  // Team roster detection
  if ((headerStr.includes('full name') || headerStr.includes('name')) && 
      headerStr.includes('email') && 
      (headerStr.includes('role') || headerStr.includes('position'))) {
    return 'team_roster';
  }
  
  // Appointments detection
  if ((headerStr.includes('appointment') || headerStr.includes('scheduled')) &&
      (headerStr.includes('closer') || headerStr.includes('call status'))) {
    return 'appointments';
  }
  
  // Leads detection
  if ((headerStr.includes('lead') || headerStr.includes('name')) &&
      headerStr.includes('email') &&
      (headerStr.includes('phone') || headerStr.includes('source'))) {
    return 'leads';
  }
  
  // Calls detection
  if ((headerStr.includes('call') || headerStr.includes('duration')) &&
      (headerStr.includes('status') || headerStr.includes('outcome'))) {
    return 'calls';
  }
  
  // Deals detection
  if ((headerStr.includes('revenue') || headerStr.includes('amount')) &&
      (headerStr.includes('deal') || headerStr.includes('closed'))) {
    return 'deals';
  }
  
  return 'unknown';
}

function calculateConfidence(headers: string[], sheetType: string): number {
  const headerStr = headers.join(' ').toLowerCase();
  
  switch (sheetType) {
    case 'team_roster':
      let score = 0;
      if (headerStr.includes('full name') || headerStr.includes('name')) score += 30;
      if (headerStr.includes('email')) score += 30;
      if (headerStr.includes('role') || headerStr.includes('position')) score += 30;
      if (headerStr.includes('phone')) score += 10;
      return score;
    
    case 'appointments':
      score = 0;
      if (headerStr.includes('appointment') || headerStr.includes('scheduled')) score += 30;
      if (headerStr.includes('closer') || headerStr.includes('assigned')) score += 25;
      if (headerStr.includes('call status') || headerStr.includes('status')) score += 25;
      if (headerStr.includes('recording')) score += 10;
      if (headerStr.includes('pipeline')) score += 10;
      return score;
    
    case 'leads':
      score = 0;
      if (headerStr.includes('lead') || headerStr.includes('name')) score += 30;
      if (headerStr.includes('email')) score += 30;
      if (headerStr.includes('phone')) score += 20;
      if (headerStr.includes('source')) score += 20;
      return score;
    
    case 'calls':
      score = 0;
      if (headerStr.includes('call') || headerStr.includes('duration')) score += 40;
      if (headerStr.includes('status') || headerStr.includes('outcome')) score += 40;
      if (headerStr.includes('date') || headerStr.includes('time')) score += 20;
      return score;
    
    case 'deals':
      score = 0;
      if (headerStr.includes('revenue') || headerStr.includes('amount')) score += 50;
      if (headerStr.includes('deal') || headerStr.includes('closed')) score += 50;
      return score;
    
    default:
      return 40;
  }
}

async function batchImport(req: Request, supabase: any, userId: string) {
  const { sheets } = await req.json();

  console.log(`Starting batch import for ${sheets.length} sheets`);

  const results = [];

  for (const sheetConfig of sheets) {
    try {
      const { sheetName, sheetType, sheetUrl, mappings, defaults } = sheetConfig;
      
      console.log(`Importing sheet: ${sheetName} (type: ${sheetType})`);

      // Route to appropriate import function
      if (sheetType === 'team_roster') {
        const { importTeamRoster } = await import('./team-roster-import.ts');
        const fakeReq = new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ sheetUrl, mappings, defaults }),
        });
        const response = await importTeamRoster(fakeReq, supabase, userId, { sheetUrl, mappings, defaults });
        const result = await response.json();
        results.push({
          sheetName,
          success: true,
          ...result,
        });
      } else {
        // Use standard import for leads/appointments/etc
        const rows = await fetchSheetData(sheetUrl);
        const dataRows = rows.slice(1);
        
        const importResult = {
          imported: 0,
          failed: 0,
          errors: [] as any[],
        };

        const leadsToInsert = [];

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          
          try {
            const lead: any = {};
            const customFields: Record<string, any> = {};

            // Apply mappings (reuse logic from executeImport)
            for (const mapping of mappings) {
              if (!mapping.dbField || mapping.dbField === 'ignore') continue;
              
              let value = row[mapping.sheetColumn];
              
              if (value) {
                switch (mapping.transformation) {
                  case 'trim':
                    value = value.trim();
                    break;
                  case 'lowercase_trim':
                    value = value.toLowerCase().trim();
                    break;
                  case 'clean_phone':
                    value = value.replace(/[^\d+]/g, '');
                    break;
                }
              }

              if (mapping.dbField === 'custom_fields') {
                const fieldKey = mapping.customFieldKey || mapping.sheetColumn.toLowerCase().replace(/\s+/g, '_');
                customFields[fieldKey] = value || null;
              } else {
                lead[mapping.dbField] = value || null;
              }
            }

            if (Object.keys(customFields).length > 0) {
              lead.custom_fields = customFields;
            }

            if (defaults) {
              Object.keys(defaults).forEach(key => {
                if (!lead[key]) lead[key] = defaults[key];
              });
            }

            if (!lead.name || !lead.email) {
              throw new Error('Missing required fields');
            }

            leadsToInsert.push(lead);
          } catch (error) {
            importResult.failed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            importResult.errors.push({
              row: i + 2,
              error: errorMessage,
            });
          }
        }

        if (leadsToInsert.length > 0) {
          const { data: inserted, error: insertError } = await supabase
            .from('leads')
            .insert(leadsToInsert)
            .select();

          if (insertError) {
            throw new Error(`Failed to insert: ${insertError.message}`);
          }

          importResult.imported = inserted?.length || 0;
        }

        results.push({
          sheetName,
          success: true,
          ...importResult,
        });
      }
    } catch (error) {
      console.error(`Failed to import sheet ${sheetConfig.sheetName}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        sheetName: sheetConfig.sheetName,
        success: false,
        imported: 0,
        failed: 0,
        errors: [{ error: errorMessage }],
      });
    }
  }

  const totalImported = results.reduce((sum, r) => sum + r.imported, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  return new Response(
    JSON.stringify({ results, totalImported, totalFailed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
