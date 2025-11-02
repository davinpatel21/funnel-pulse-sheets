import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify API key
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: keyData, error: keyError } = await supabaseClient
      .from('api_keys')
      .select('user_id, is_active')
      .eq('api_key', apiKey)
      .single();

    if (keyError || !keyData || !keyData.is_active) {
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last_used_at
    await supabaseClient
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('api_key', apiKey);

    const url = new URL(req.url);
    const path = url.pathname.replace('/api/', '');
    const [resource, id] = path.split('/');

    // GET /api/leads - List leads
    if (req.method === 'GET' && resource === 'leads' && !id) {
      const { data, error } = await supabaseClient
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /api/leads/:id - Get single lead
    if (req.method === 'GET' && resource === 'leads' && id) {
      const { data, error } = await supabaseClient
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /api/leads - Create lead
    if (req.method === 'POST' && resource === 'leads') {
      const body = await req.json();
      const { data, error } = await supabaseClient
        .from('leads')
        .insert([body])
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabaseClient.from('activity_log').insert([{
        user_id: keyData.user_id,
        action: 'created',
        table_name: 'leads',
        record_id: data.id,
        new_data: data,
      }]);

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH /api/leads/:id - Update lead
    if (req.method === 'PATCH' && resource === 'leads' && id) {
      const body = await req.json();
      const { data, error } = await supabaseClient
        .from('leads')
        .update(body)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabaseClient.from('activity_log').insert([{
        user_id: keyData.user_id,
        action: 'updated',
        table_name: 'leads',
        record_id: data.id,
        new_data: data,
      }]);

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /api/leads/:id - Delete lead
    if (req.method === 'DELETE' && resource === 'leads' && id) {
      const { error } = await supabaseClient
        .from('leads')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Log activity
      await supabaseClient.from('activity_log').insert([{
        user_id: keyData.user_id,
        action: 'deleted',
        table_name: 'leads',
        record_id: id,
      }]);

      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
