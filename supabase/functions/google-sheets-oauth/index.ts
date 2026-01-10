import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Structured error response helper
function errorResponse(message: string, code: string, status: number) {
  return new Response(
    JSON.stringify({ error: message, code, status }),
    { 
      status, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get OAuth credentials from environment
    const clientId = Deno.env.get('GOOGLE_SHEETS_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return errorResponse(
        'Google OAuth credentials not configured. Please contact your administrator.',
        'CONFIG_ERROR',
        500
      );
    }

    const redirectUri = `${supabaseUrl}/functions/v1/google-sheets-oauth/callback`;

    // Route: Initiate OAuth flow
    if (path === 'initiate') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse(
          'Please sign in to connect your Google account',
          'AUTH_REQUIRED',
          401
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        console.error('User validation error:', userError);
        return errorResponse(
          'Your session has expired. Please sign in again.',
          'SESSION_EXPIRED',
          401
        );
      }

      // Capture origin from the requesting frontend
      const redirectOrigin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/');

      // Store user ID and redirect origin in state parameter
      const state = btoa(JSON.stringify({ userId: user.id, redirectOrigin }));

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);

      return new Response(
        JSON.stringify({ authUrl: authUrl.toString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Handle OAuth callback
    if (path === 'callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const errorParam = url.searchParams.get('error');

      // Handle Google OAuth errors (user denied, etc.)
      if (errorParam) {
        console.error('Google OAuth error:', errorParam);
        // Try to extract redirect origin from state if available
        let errorRedirectUrl = Deno.env.get('FRONTEND_URL');
        if (!errorRedirectUrl && state) {
          try {
            const decoded = JSON.parse(atob(state));
            errorRedirectUrl = decoded.redirectOrigin;
          } catch (e) {
            // Ignore parse error
          }
        }
        if (!errorRedirectUrl) {
          errorRedirectUrl = 'https://funnel-pulse-sheets.lovable.app';
        }
        errorRedirectUrl = errorRedirectUrl.replace(/\/$/, '');
        
        return new Response(null, {
          status: 302,
          headers: {
            'Location': `${errorRedirectUrl}/settings?oauth=error&reason=${encodeURIComponent(errorParam)}`,
          },
        });
      }

      if (!code || !state) {
        return errorResponse('Missing code or state parameter', 'INVALID_CALLBACK', 400);
      }

      // Decode state to get user ID and redirect origin
      let userId: string;
      let redirectOrigin: string | undefined;
      try {
        const decoded = JSON.parse(atob(state));
        userId = decoded.userId;
        redirectOrigin = decoded.redirectOrigin;
      } catch (e) {
        return errorResponse('Invalid state parameter', 'INVALID_STATE', 400);
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Token exchange failed:', error);
        const frontendUrl = Deno.env.get('FRONTEND_URL') || redirectOrigin || 'https://funnel-pulse-sheets.lovable.app';
        return new Response(null, {
          status: 302,
          headers: {
            'Location': `${frontendUrl.replace(/\/$/, '')}/settings?oauth=error&reason=token_exchange_failed`,
          },
        });
      }

      const tokens = await tokenResponse.json();

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Store tokens in database (upsert)
      const { error: dbError } = await supabase
        .from('google_sheets_credentials')
        .upsert({
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt.toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (dbError) {
        console.error('Database error:', dbError);
        const frontendUrl = Deno.env.get('FRONTEND_URL') || redirectOrigin || 'https://funnel-pulse-sheets.lovable.app';
        return new Response(null, {
          status: 302,
          headers: {
            'Location': `${frontendUrl.replace(/\/$/, '')}/settings?oauth=error&reason=storage_failed`,
          },
        });
      }

      // Determine redirect URL with priority: FRONTEND_URL > redirectOrigin > fallback
      const frontendUrl = Deno.env.get('FRONTEND_URL');
      let finalRedirectUrl: string;
      
      if (frontendUrl) {
        finalRedirectUrl = `${frontendUrl.replace(/\/$/, '')}/settings?oauth=success`;
      } else if (redirectOrigin) {
        finalRedirectUrl = `${redirectOrigin.replace(/\/$/, '')}/settings?oauth=success`;
      } else {
        // Fallback to hardcoded domain
        finalRedirectUrl = 'https://funnel-pulse-sheets.lovable.app/settings?oauth=success';
      }

      console.log('OAuth successful, redirecting to:', finalRedirectUrl);

      // Redirect back to settings page with success message
      return new Response(null, {
        status: 302,
        headers: {
          'Location': finalRedirectUrl,
        },
      });
    }

    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OAuth error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(errorMessage, 'INTERNAL_ERROR', 500);
  }
});