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
    } else if (action === 'import') {
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

  const systemPrompt = `You are a data mapping expert. Analyze this Google Sheet and suggest field mappings for a CRM system.
    
STEP 1: DETECT SHEET TYPE
Analyze the column headers to determine what type of data this sheet contains:

- APPOINTMENTS: Look for "Booking Time", "Scheduled", "Appointment Date", "Calendar", "Meeting Time", "Calendly"
- DEALS: Look for "Revenue", "Amount", "Price", "Cash Collected", "Deal Value", "Won/Lost", "Sale", "Closed"
- CALLS: Look for "Call Duration", "Call Time", "Live/Voicemail", "Minutes", "Phone Call", "Was Live"
- LEADS: Look for "Name", "Email", "Phone", "Source", "Lead Source" (default if unclear)

STEP 2: MAP FIELDS BASED ON SHEET TYPE

For LEADS sheets, map to these fields:
- name (required): Full name or first name
- email (required): Email address
- phone (optional): Phone number
- source (required): Lead source - MUST be one of: "facebook", "instagram", "linkedin", "twitter", "google", "referral", "website", "other"
- notes (optional): Any additional information

For APPOINTMENTS sheets, map to custom_fields:
- All columns should go to custom_fields (use transformation: "to_custom")
- Still extract name and email if present

For DEALS sheets, map to custom_fields:
- All columns should go to custom_fields (use transformation: "to_custom")
- Still extract name and email if present

For CALLS sheets, map to custom_fields:
- All columns should go to custom_fields (use transformation: "to_custom")
- Still extract name and email if present

CRITICAL RULES:
1. ALWAYS map 'name' and 'email' if they exist - these connect records
2. For 'source' field (LEADS sheets only):
   - Look for columns like: Source, Lead Source, UTM Source, Campaign, Channel, Origin
   - Map to closest matching enum value: facebook, instagram, linkedin, twitter, google, referral, website, other
   - If no source column exists, use transformation: "default_other"
   - Add transformation: "map_to_enum" if you map a source column
3. For any non-standard fields, map them to custom_fields with transformation: "to_custom"

Available transformations:
- "none": Use value as-is
- "to_lowercase": Convert to lowercase
- "to_uppercase": Convert to uppercase
- "trim_whitespace": Remove extra spaces
- "map_to_enum": Map text values to predefined options
- "to_custom": Store in custom_fields jsonb
- "default_other": Set default value to "other"

Return a JSON object with this structure:
{
  "sheet_type": "leads|appointments|deals|calls",
  "mappings": [
    {
      "sheet_column": "Original Column Name",
      "db_field": "target_field_name",
      "transformation": "transformation_name",
      "confidence": "high|medium|low"
    }
  ],
  "warnings": ["Any issues or recommendations"],
  "headers": ["all", "column", "names"],
  "row_count": 123,
  "sample_rows": [first 3 rows of data]
}
6. Identify potential data quality issues
7. Return ONLY valid JSON, no markdown or explanations

Return format:
{
  "mappings": [
    {
      "sheetColumn": "column name from sheet",
      "dbField": "database field name or null or custom_fields",
      "customFieldKey": "field_key_name (only if dbField is custom_fields)",
      "confidence": 95,
      "transformation": "trim|lowercase_trim|clean_phone|map_to_enum|none",
      "notes": "explanation if needed"
    }
  ],
  "warnings": ["list of potential issues"],
  "suggestedDefaults": {
    "source": "other",
    "status": "new"
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

  // Add sample data to mappings for preview
  analysisResult.mappings = analysisResult.mappings.map((mapping: any) => ({
    ...mapping,
    sampleValue: sampleRows[0]?.[mapping.sheetColumn] || '',
  }));

  const sheetId = extractSheetId(sheetUrl);

  return new Response(
    JSON.stringify({
      sheetId,
      headers,
      totalRows: rows.length - 1,
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
