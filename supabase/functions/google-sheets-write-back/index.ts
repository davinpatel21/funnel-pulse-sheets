import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WriteBackRequest {
  operation: 'insert' | 'update' | 'delete';
  table: 'leads' | 'appointments' | 'deals' | 'calls';
  recordId: string;
  data?: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    const { operation, table, recordId, data }: WriteBackRequest = await req.json();

    console.log(`Write-back operation: ${operation} on ${table} for record ${recordId}`);

    // Get the record with sync metadata
    const { data: record, error: recordError } = await supabase
      .from(table)
      .select('*')
      .eq('id', recordId)
      .single();

    if (recordError || !record) {
      throw new Error(`Record not found: ${recordError?.message}`);
    }

    const syncMetadata = record.sync_metadata || {};

    // Only sync if there's a sheet_config_id
    if (!syncMetadata.sheet_config_id) {
      console.log('No sheet configuration for this record, skipping sync');
      return new Response(
        JSON.stringify({ success: true, message: 'No sheet sync configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get sheet configuration
    const { data: sheetConfig, error: configError } = await supabase
      .from('sheet_configurations')
      .select('*')
      .eq('id', syncMetadata.sheet_config_id)
      .single();

    if (configError || !sheetConfig) {
      throw new Error(`Sheet configuration not found: ${configError?.message}`);
    }

    // Get OAuth tokens
    const { data: credentials, error: credError } = await supabase
      .from('google_sheets_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      throw new Error('Google Sheets not connected. Please connect in Settings.');
    }

    // Refresh token if expired
    let accessToken = credentials.access_token;
    if (new Date(credentials.expires_at) < new Date()) {
      accessToken = await refreshAccessToken(credentials.refresh_token, user.id, supabase);
    }

    // Extract sheet ID from URL
    const sheetIdMatch = sheetConfig.sheet_url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      throw new Error('Invalid sheet URL');
    }
    const sheetId = sheetIdMatch[1];

    const mappings = sheetConfig.mappings;
    const rowNumber = syncMetadata.sheet_row_number;

    if (operation === 'delete') {
      // Delete row from Google Sheets
      await deleteSheetRow(sheetId, rowNumber, accessToken);
      
      console.log(`Deleted row ${rowNumber} from Google Sheets`);
    } else if (operation === 'update' && rowNumber) {
      // Update existing row
      const rowData = mapRecordToSheetRow(data || record, mappings);
      await updateSheetRow(sheetId, rowNumber, rowData, accessToken);
      
      console.log(`Updated row ${rowNumber} in Google Sheets`);
    } else if (operation === 'insert') {
      // Append new row
      const rowData = mapRecordToSheetRow(data || record, mappings);
      const newRowNumber = await appendSheetRow(sheetId, rowData, accessToken);
      
      // Update sync metadata with new row number
      await supabase
        .from(table)
        .update({
          sync_metadata: {
            ...syncMetadata,
            sheet_row_number: newRowNumber,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
          }
        })
        .eq('id', recordId);
      
      console.log(`Inserted new row ${newRowNumber} in Google Sheets`);
    }

    // Update sync metadata
    if (operation !== 'delete') {
      await supabase
        .from(table)
        .update({
          sync_metadata: {
            ...syncMetadata,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
          }
        })
        .eq('id', recordId);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Write-back error:', error);
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

  // Update stored credentials
  await supabase
    .from('google_sheets_credentials')
    .update({
      access_token: tokens.access_token,
      expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);

  return tokens.access_token;
}

function mapRecordToSheetRow(record: any, mappings: any): string[] {
  const row: string[] = [];
  
  for (const [columnIndex, mapping] of Object.entries(mappings)) {
    const dbField = (mapping as any).to_field;
    let value = record[dbField] || '';
    
    // Handle different field types
    if (value instanceof Date) {
      value = value.toISOString();
    } else if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    
    row[parseInt(columnIndex)] = String(value);
  }
  
  return row;
}

async function updateSheetRow(sheetId: string, rowNumber: number, rowData: string[], accessToken: string) {
  const range = `A${rowNumber}:Z${rowNumber}`;
  
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowData],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update sheet: ${error}`);
  }
}

async function appendSheetRow(sheetId: string, rowData: string[], accessToken: string): Promise<number> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:Z:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowData],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to append sheet row: ${error}`);
  }

  const result = await response.json();
  const updatedRange = result.updates.updatedRange;
  const rowMatch = updatedRange.match(/A(\d+):/);
  
  return rowMatch ? parseInt(rowMatch[1]) : 0;
}

async function deleteSheetRow(sheetId: string, rowNumber: number, accessToken: string) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // Assumes first sheet
              dimension: 'ROWS',
              startIndex: rowNumber - 1, // 0-indexed
              endIndex: rowNumber,
            },
          },
        }],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete sheet row: ${error}`);
  }
}
