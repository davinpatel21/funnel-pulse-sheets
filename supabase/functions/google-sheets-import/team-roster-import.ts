import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export async function importTeamRoster(req: Request, supabase: any, userId: string, body: any) {
  const { sheetUrl, mappings } = body;

  if (!sheetUrl || !mappings) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: sheetUrl, mappings' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Extract sheet ID
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      throw new Error('Invalid Google Sheets URL');
    }

    // Fetch all data from sheet
    const rows = await fetchSheetData(sheetUrl);
    
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ imported: 0, failed: 0, errors: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for inserting profiles
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const profilesToUpsert = [];
    const errors = [];

    for (const row of rows) {
      try {
        const profile: any = {};

        // Apply mappings
        for (const [key, mapping] of Object.entries(mappings as Record<string, any>)) {
          const value = row[key];
          if (!value) continue;

          const field = mapping.field;
          let transformedValue = value;

          // Apply transformations
          if (mapping.transformation === 'trim') {
            transformedValue = value.trim();
          } else if (mapping.transformation === 'lowercase') {
            transformedValue = value.toLowerCase();
          } else if (mapping.transformation === 'uppercase') {
            transformedValue = value.toUpperCase();
          }

          // Map to profile fields
          if (field === 'full_name') {
            profile.full_name = transformedValue;
          } else if (field === 'email') {
            profile.email = transformedValue.toLowerCase().trim();
          } else if (field === 'role') {
            // Map role values
            profile.role = mapToRoleEnum(transformedValue);
          }
        }

        // Validate required fields
        if (!profile.full_name || !profile.email) {
          errors.push(`Skipping row: Missing name or email`);
          continue;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(profile.email)) {
          errors.push(`Skipping row: Invalid email ${profile.email}`);
          continue;
        }

        // Generate ID (not linked to auth.users)
        profile.id = crypto.randomUUID();
        profile.created_at = new Date().toISOString();
        profile.updated_at = new Date().toISOString();

        profilesToUpsert.push(profile);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Error processing row: ${errorMessage}`);
      }
    }

    // Upsert profiles (insert or update based on email)
    let imported = 0;
    for (const profile of profilesToUpsert) {
      const { error } = await supabaseAdmin
        .from('profiles')
        .upsert(profile, {
          onConflict: 'email',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Error upserting profile:', error);
        errors.push(`Failed to import ${profile.full_name}: ${error.message}`);
      } else {
        imported++;
      }
    }

    const failed = profilesToUpsert.length - imported;

    return new Response(
      JSON.stringify({ 
        imported, 
        failed, 
        errors: errors.slice(0, 10) // Return first 10 errors
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Team roster import error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function extractSheetId(sheetUrl: string): string | null {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function fetchSheetData(sheetUrl: string, maxRows?: number): Promise<any[]> {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) throw new Error('Invalid sheet URL');

  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const response = await fetch(csvUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet data: ${response.statusText}`);
  }

  const csvText = await response.text();
  const rows = parseCsv(csvText);
  
  return maxRows ? rows.slice(0, maxRows) : rows;
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

function mapToRoleEnum(value: string): string {
  const normalized = value.toLowerCase().trim();
  
  if (normalized === 'closer' || normalized === 'manager') {
    return 'closer';
  } else if (normalized === 'setter' || normalized === 'dialer') {
    return 'setter';
  } else if (normalized === 'admin') {
    return 'admin';
  }
  
  return 'setter'; // Default
}
