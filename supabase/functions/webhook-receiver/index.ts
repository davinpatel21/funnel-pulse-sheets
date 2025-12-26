import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
};

// Input validation schema
const webhookPayloadSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  full_name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  phone_number: z.string().max(20).optional(),
  source: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  message: z.string().max(1000).optional(),
}).passthrough();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate webhook using secret token
    const webhookToken = req.headers.get('x-webhook-token');
    const expectedToken = Deno.env.get('WEBHOOK_SECRET_TOKEN');

    if (!expectedToken) {
      console.error('WEBHOOK_SECRET_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!webhookToken || webhookToken !== expectedToken) {
      console.warn('Invalid or missing webhook token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const rawPayload = await req.json();
    console.log('Received webhook payload');

    // Validate and sanitize input
    const parseResult = webhookPayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      console.error('Validation failed:', parseResult.error.errors);
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: parseResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = parseResult.data;

    // Extract and sanitize lead data
    const leadData = {
      name: (payload.name || payload.full_name || 'Unknown').slice(0, 100),
      email: payload.email.toLowerCase().trim(),
      phone: (payload.phone || payload.phone_number || null)?.slice(0, 20) || null,
      source: 'other' as const, // Force valid enum value
      status: 'new' as const,
      notes: (payload.notes || payload.message || null)?.slice(0, 1000) || null,
    };

    // Insert lead into database
    const { data, error } = await supabaseClient
      .from('leads')
      .insert([leadData])
      .select()
      .single();

    if (error) {
      console.error('Error inserting lead:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Lead created successfully:', data.id);

    // Log activity
    await supabaseClient.from('activity_log').insert([{
      action: 'created',
      table_name: 'leads',
      record_id: data.id,
      new_data: data,
    }]);

    return new Response(
      JSON.stringify({ success: true, lead: { id: data.id } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
