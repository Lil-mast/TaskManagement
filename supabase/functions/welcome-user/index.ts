import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, email } = await req.json();

    if (!userId || !email) {
      throw new Error('Missing required fields: userId, email');
    }

    // Check if welcome email already sent
    const { data: existingNotif } = await supabase
      .from('user_notifications')
      .select('welcome_email_sent')
      .eq('user_id', userId)
      .single();

    if (existingNotif?.welcome_email_sent) {
      return new Response(
        JSON.stringify({ success: true, message: 'Welcome email already sent' }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Create or update user notification record
    const { error: upsertError } = await supabase
      .from('user_notifications')
      .upsert({
        user_id: userId,
        email: email,
        welcome_email_sent: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      throw new Error(`Failed to update user notifications: ${upsertError.message}`);
    }

    // Send welcome email
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
    
    const emailResponse = await fetch(sendEmailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        type: 'welcome',
        userId,
        email,
        data: {},
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      // Don't throw - we still updated the DB
      console.error('Failed to send welcome email:', errorText);
    }

    // Initialize user streak record
    const { error: streakError } = await supabase
      .from('user_streaks')
      .upsert({
        user_id: userId,
        current_streak: 0,
        longest_streak: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (streakError) {
      console.error('Failed to initialize streak:', streakError.message);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User welcomed successfully',
        emailSent: emailResponse.ok 
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
