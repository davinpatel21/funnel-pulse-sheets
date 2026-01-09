import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Input validation schemas
const createLeadSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255).toLowerCase(),
  phone: z.string().max(20).optional().nullable(),
  source: z.enum(['youtube', 'instagram', 'discord', 'email', 'vendor_doc', 'sms', 'facebook', 'tiktok', 'referral', 'other']).default('other'),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified']).default('new'),
  notes: z.string().max(1000).optional().nullable(),
  utm_source: z.string().max(255).optional().nullable(),
  custom_fields: z.record(z.any()).optional().nullable(),
}).strict();

const updateLeadSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  email: z.string().email().max(255).toLowerCase().optional(),
  phone: z.string().max(20).optional().nullable(),
  source: z.enum(['youtube', 'instagram', 'discord', 'email', 'vendor_doc', 'sms', 'facebook', 'tiktok', 'referral', 'other']).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  utm_source: z.string().max(255).optional().nullable(),
  custom_fields: z.record(z.any()).optional().nullable(),
  setter_id: z.string().uuid().optional().nullable(),
  closer_id: z.string().uuid().optional().nullable(),
}).strict();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify API key using secure hash comparison
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash the incoming key and compare with stored hash
    const { data: hashedKey, error: hashError } = await supabaseClient.rpc('hash_api_key', { key: apiKey });
    if (hashError) {
      console.error('Hash error:', hashError);
      return new Response(
        JSON.stringify({ error: 'Internal error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: keyData, error: keyError } = await supabaseClient
      .from('api_keys')
      .select('id, user_id, is_active')
      .eq('api_key_hash', hashedKey)
      .single();

    if (keyError || !keyData || !keyData.is_active) {
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last_used_at using the key's ID (not plaintext key)
    await supabaseClient
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

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
      // Validate UUID format
      const uuidSchema = z.string().uuid();
      const idResult = uuidSchema.safeParse(id);
      if (!idResult.success) {
        return new Response(
          JSON.stringify({ error: 'Invalid lead ID format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
      const rawBody = await req.json();
      
      const parseResult = createLeadSchema.safeParse(rawBody);
      if (!parseResult.success) {
        return new Response(
          JSON.stringify({ error: 'Validation failed', details: parseResult.error.errors }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const validatedData = parseResult.data;
      
      const { data, error } = await supabaseClient
        .from('leads')
        .insert([validatedData])
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
      // Validate UUID format
      const uuidSchema = z.string().uuid();
      const idResult = uuidSchema.safeParse(id);
      if (!idResult.success) {
        return new Response(
          JSON.stringify({ error: 'Invalid lead ID format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rawBody = await req.json();
      
      const parseResult = updateLeadSchema.safeParse(rawBody);
      if (!parseResult.success) {
        return new Response(
          JSON.stringify({ error: 'Validation failed', details: parseResult.error.errors }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const validatedData = parseResult.data;
      
      const { data, error } = await supabaseClient
        .from('leads')
        .update(validatedData)
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
      // Validate UUID format
      const uuidSchema = z.string().uuid();
      const idResult = uuidSchema.safeParse(id);
      if (!idResult.success) {
        return new Response(
          JSON.stringify({ error: 'Invalid lead ID format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
