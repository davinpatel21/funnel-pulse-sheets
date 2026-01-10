import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function errorResponse(message: string, code: string, status: number) {
  return new Response(
    JSON.stringify({ error: message, code, status }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function refreshAccessToken(supabase: any, userId: string, refreshToken: string, clientId: string, clientSecret: string) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Token refresh failed:', error);
    throw new Error('Failed to refresh access token');
  }

  const tokens = await tokenResponse.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await supabase
    .from('google_sheets_credentials')
    .update({
      access_token: tokens.access_token,
      expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);

  return tokens.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Please sign in to view spreadsheet tabs', 'AUTH_REQUIRED', 401);
    }

    const url = new URL(req.url);
    const spreadsheetId = url.searchParams.get('spreadsheetId');
    
    if (!spreadsheetId) {
      return errorResponse('Spreadsheet ID is required', 'MISSING_PARAM', 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return errorResponse('Your session has expired. Please sign in again.', 'SESSION_EXPIRED', 401);
    }

    // Get stored credentials
    const { data: credentials, error: credError } = await supabase
      .from('google_sheets_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      return errorResponse('Please connect your Google account first', 'NOT_CONNECTED', 400);
    }

    const clientId = Deno.env.get('GOOGLE_SHEETS_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return errorResponse('Google OAuth not configured', 'CONFIG_ERROR', 500);
    }

    // Check if token is expired and refresh if needed
    let accessToken = credentials.access_token;
    const expiresAt = new Date(credentials.expires_at);
    
    if (expiresAt <= new Date()) {
      console.log('Access token expired, refreshing...');
      accessToken = await refreshAccessToken(
        supabase, 
        user.id, 
        credentials.refresh_token, 
        clientId, 
        clientSecret
      );
    }

    // Get spreadsheet metadata including sheets
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets(properties(sheetId,title,gridProperties.rowCount))`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!sheetsResponse.ok) {
      const error = await sheetsResponse.text();
      console.error('Sheets API error:', error);
      
      if (sheetsResponse.status === 401) {
        return errorResponse('Google access expired. Please reconnect your account.', 'TOKEN_EXPIRED', 401);
      }
      
      if (sheetsResponse.status === 404) {
        return errorResponse('Spreadsheet not found or not accessible', 'NOT_FOUND', 404);
      }
      
      return errorResponse('Failed to get spreadsheet details', 'SHEETS_ERROR', 500);
    }

    const sheetsData = await sheetsResponse.json();

    const sheets = (sheetsData.sheets || []).map((sheet: any) => ({
      sheetId: sheet.properties.sheetId,
      title: sheet.properties.title,
      rowCount: sheet.properties.gridProperties?.rowCount || 0,
    }));

    return new Response(
      JSON.stringify({
        spreadsheetId: sheetsData.spreadsheetId,
        title: sheetsData.properties?.title || 'Untitled',
        sheets,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Get tabs error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(errorMessage, 'INTERNAL_ERROR', 500);
  }
});
