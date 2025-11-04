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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting auto-sync process...');

    // Get all active sheet configurations
    const { data: configs, error: configError } = await supabase
      .from('sheet_configurations')
      .select('*')
      .eq('is_active', true);

    if (configError) {
      throw new Error(`Failed to fetch configs: ${configError.message}`);
    }

    if (!configs || configs.length === 0) {
      console.log('No active sheet configurations found');
      return new Response(
        JSON.stringify({ message: 'No configs to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const config of configs) {
      try {
        console.log(`Syncing sheet config: ${config.id} (${config.sheet_type})`);

        // Get user's OAuth credentials
        const { data: credentials, error: credError } = await supabase
          .from('google_sheets_credentials')
          .select('*')
          .eq('user_id', config.user_id)
          .single();

        if (credError || !credentials) {
          console.log(`No credentials for user ${config.user_id}, skipping`);
          continue;
        }

        // Refresh token if expired
        let accessToken = credentials.access_token;
        if (new Date(credentials.expires_at) < new Date()) {
          accessToken = await refreshAccessToken(credentials.refresh_token, config.user_id, supabase);
        }

        // Extract sheet ID from URL
        const sheetIdMatch = config.sheet_url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!sheetIdMatch) {
          console.error('Invalid sheet URL:', config.sheet_url);
          continue;
        }
        const sheetId = sheetIdMatch[1];

        // Fetch sheet data
        const sheetData = await fetchSheetData(sheetId, accessToken);

        if (!sheetData || sheetData.length < 2) {
          console.log('No data in sheet');
          continue;
        }

        // First row is headers, rest is data
        const headers = sheetData[0];
        const rows = sheetData.slice(1);

        // Determine table name from sheet type
        const tableName = config.sheet_type;

        // Sync each row
        let synced = 0;
        let errors = 0;

        for (let i = 0; i < rows.length; i++) {
          const rowNumber = i + 2; // +2 because row 1 is headers and sheets are 1-indexed
          const row = rows[i];

          try {
            // Map row to record
            const record = mapSheetRowToRecord(row, config.mappings);
            
            if (!record || Object.keys(record).length === 0) {
              continue;
            }

            // Check if record exists by row number
            const { data: existing, error: queryError } = await supabase
              .from(tableName)
              .select('*')
              .eq('sync_metadata->>sheet_config_id', config.id)
              .eq('sync_metadata->>sheet_row_number', rowNumber.toString())
              .maybeSingle();

            if (queryError) {
              console.error('Query error:', queryError);
              errors++;
              continue;
            }

            const syncMetadata = {
              sheet_config_id: config.id,
              sheet_row_number: rowNumber,
              sync_status: 'synced',
              last_synced_at: new Date().toISOString(),
            };

            if (existing) {
              // Update existing record (only if not locally modified)
              const existingSyncStatus = existing.sync_metadata?.sync_status;
              
              if (existingSyncStatus === 'modified_locally') {
                console.log(`Record ${existing.id} modified locally, skipping update`);
                continue;
              }

              const { error: updateError } = await supabase
                .from(tableName)
                .update({
                  ...record,
                  sync_metadata: syncMetadata,
                })
                .eq('id', existing.id);

              if (updateError) {
                console.error('Update error:', updateError);
                errors++;
              } else {
                synced++;
              }
            } else {
              // Insert new record
              const { error: insertError } = await supabase
                .from(tableName)
                .insert({
                  ...record,
                  sync_metadata: syncMetadata,
                });

              if (insertError) {
                console.error('Insert error:', insertError);
                errors++;
              } else {
                synced++;
              }
            }
          } catch (rowError) {
            console.error(`Error processing row ${rowNumber}:`, rowError);
            errors++;
          }
        }

        // Update last synced timestamp
        await supabase
          .from('sheet_configurations')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', config.id);

        // Log sync operation
        await supabase
          .from('sync_operations')
          .insert({
            user_id: config.user_id,
            sheet_config_id: config.id,
            operation_type: 'pull',
            records_affected: synced,
            errors: errors > 0 ? { count: errors } : null,
            completed_at: new Date().toISOString(),
            status: errors > 0 ? 'completed' : 'completed',
          });

        results.push({
          config_id: config.id,
          sheet_type: config.sheet_type,
          synced,
          errors,
        });

        console.log(`Synced ${synced} records with ${errors} errors for ${config.sheet_type}`);

      } catch (configError) {
        console.error(`Error syncing config ${config.id}:`, configError);
        const errorMessage = configError instanceof Error ? configError.message : 'Unknown error';
        results.push({
          config_id: config.id,
          error: errorMessage,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function refreshAccessToken(refreshToken: string, userId: string, supabase: any): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_SHEETS_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET')!;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await response.json();
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

async function fetchSheetData(sheetId: string, accessToken: string): Promise<string[][]> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:Z`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch sheet data: ${error}`);
  }

  const result = await response.json();
  return result.values || [];
}

function mapSheetRowToRecord(row: string[], mappings: any): any {
  const record: any = {};
  
  for (const [columnIndex, mapping] of Object.entries(mappings)) {
    const idx = parseInt(columnIndex);
    const value = row[idx];
    const dbField = (mapping as any).to_field;
    
    if (!dbField || value === undefined || value === '') {
      continue;
    }
    
    // Apply any transformations
    record[dbField] = value;
  }
  
  return record;
}
