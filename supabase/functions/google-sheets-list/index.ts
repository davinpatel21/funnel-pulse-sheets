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

  // Update stored tokens
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
      return errorResponse('Please sign in to browse your spreadsheets', 'AUTH_REQUIRED', 401);
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

    // List spreadsheets from Google Drive
    const driveResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id,name,modifiedTime,webViewLink)',
        orderBy: 'modifiedTime desc',
        pageSize: '50',
      }),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!driveResponse.ok) {
      const error = await driveResponse.text();
      console.error('Drive API error:', error);
      
      if (driveResponse.status === 401) {
        return errorResponse('Google access expired. Please reconnect your account.', 'TOKEN_EXPIRED', 401);
      }
      
      return errorResponse('Failed to list spreadsheets', 'DRIVE_ERROR', 500);
    }

    const driveData = await driveResponse.json();

    return new Response(
      JSON.stringify({ files: driveData.files || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('List spreadsheets error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(errorMessage, 'INTERNAL_ERROR', 500);
  }
});
