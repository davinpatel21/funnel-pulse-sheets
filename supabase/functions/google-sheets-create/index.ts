import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Canonical schema for the sales tracker
const SHEET_TABS = {
  team_members: {
    name: 'Team Members',
    headers: [
      'team_member_id', 'first_name', 'last_name', 'full_name', 'email', 'phone',
      'role', 'department', 'active', 'created_at', 'updated_at', 'updated_by', 'is_deleted'
    ],
    sheetType: 'team'
  },
  leads: {
    name: 'Leads',
    headers: [
      'lead_id', 'full_name', 'email', 'phone', 'source', 'utm_source', 'utm_campaign',
      'owner_id', 'setter_id', 'closer_id', 'status', 'notes',
      'created_at', 'updated_at', 'updated_by', 'is_deleted'
    ],
    sheetType: 'leads'
  },
  appointments: {
    name: 'Appointments',
    headers: [
      'appointment_id', 'lead_id', 'scheduled_for', 'setter_id', 'closer_id',
      'status', 'notes', 'created_at', 'updated_at', 'updated_by', 'is_deleted'
    ],
    sheetType: 'appointments'
  },
  calls: {
    name: 'Calls',
    headers: [
      'call_id', 'lead_id', 'appointment_id', 'call_time', 'setter_id', 'closer_id',
      'status', 'duration_seconds', 'recording_url', 'call_notes',
      'created_at', 'updated_at', 'updated_by', 'is_deleted'
    ],
    sheetType: 'calls'
  },
  deals: {
    name: 'Deals',
    headers: [
      'deal_id', 'lead_id', 'call_id', 'closer_id', 'stage', 'amount', 'cash_collected',
      'currency', 'payment_platform', 'close_date', 'loss_reason', 'notes', 'recording_url',
      'created_at', 'updated_at', 'updated_by', 'is_deleted'
    ],
    sheetType: 'deals'
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { sheetName } = await req.json();
    const finalSheetName = sheetName || `Sales Tracker - ${new Date().toLocaleDateString()}`;

    console.log(`Creating sheet: ${finalSheetName} for user ${user.id}`);

    // Get user's Google credentials
    const { data: credentials, error: credError } = await supabase
      .from('google_sheets_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      throw new Error('Google Sheets not connected. Please connect Google Sheets first.');
    }

    // Refresh token if expired
    let accessToken = credentials.access_token;
    if (new Date(credentials.expires_at) <= new Date()) {
      accessToken = await refreshAccessToken(credentials.refresh_token, user.id, supabase);
    }

    // Create the Google Sheet with multiple tabs
    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: finalSheetName,
        },
        sheets: Object.values(SHEET_TABS).map((tab, index) => ({
          properties: {
            sheetId: index,
            title: tab.name,
            index: index,
          },
        })),
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Failed to create spreadsheet:', errorText);
      throw new Error(`Failed to create spreadsheet: ${errorText}`);
    }

    const spreadsheet = await createResponse.json();
    const spreadsheetId = spreadsheet.spreadsheetId;
    const spreadsheetUrl = spreadsheet.spreadsheetUrl;

    console.log(`Created spreadsheet: ${spreadsheetId}`);

    // Add headers to each tab
    const batchUpdateData = [];
    for (const [key, tab] of Object.entries(SHEET_TABS)) {
      batchUpdateData.push({
        range: `'${tab.name}'!A1:${String.fromCharCode(65 + tab.headers.length - 1)}1`,
        values: [tab.headers],
      });
    }

    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: batchUpdateData,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Failed to add headers:', errorText);
      throw new Error(`Failed to add headers: ${errorText}`);
    }

    console.log('Added headers to all tabs');

    // Format headers (bold, freeze first row)
    const formatRequests = Object.values(SHEET_TABS).map((tab, index) => ([
      {
        repeatCell: {
          range: {
            sheetId: index,
            startRowIndex: 0,
            endRowIndex: 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.2, blue: 0.3 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      {
        updateSheetProperties: {
          properties: {
            sheetId: index,
            gridProperties: { frozenRowCount: 1 },
          },
          fields: 'gridProperties.frozenRowCount',
        },
      },
    ])).flat();

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: formatRequests }),
      }
    );

    console.log('Formatted headers');

    // Create sheet_configurations for each tab
    const configInserts = Object.values(SHEET_TABS).map((tab, index) => ({
      user_id: user.id,
      sheet_url: `${spreadsheetUrl}#gid=${index}`,
      sheet_type: tab.sheetType,
      sheet_name: tab.name,
      mappings: tab.headers.reduce((acc: Record<string, string>, header: string) => {
        acc[header] = header;
        return acc;
      }, {}),
      is_active: true,
    }));

    const { error: configError } = await supabase
      .from('sheet_configurations')
      .insert(configInserts);

    if (configError) {
      console.error('Failed to save configurations:', configError);
      throw new Error('Failed to save sheet configurations');
    }

    console.log('Saved sheet configurations');

    return new Response(
      JSON.stringify({
        success: true,
        spreadsheetId,
        spreadsheetUrl,
        message: `Created "${finalSheetName}" with ${Object.keys(SHEET_TABS).length} tabs`,
        tabs: Object.values(SHEET_TABS).map(t => t.name),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function refreshAccessToken(refreshToken: string, userId: string, supabase: any): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_SHEETS_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to refresh access token');
  }

  const tokens = await tokenResponse.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await supabase
    .from('google_sheets_credentials')
    .update({
      access_token: tokens.access_token,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return tokens.access_token;
}
