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

    // Get all users with email notifications enabled
    const { data: users, error: usersError } = await supabase
      .from('user_notifications')
      .select('user_id, email, last_weekly_report')
      .eq('email_enabled', true)
      .not('email', 'is', null);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    const results = [];
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Process each user
    for (const user of users || []) {
      // Skip if report was already sent this week
      if (user.last_weekly_report && new Date(user.last_weekly_report) > new Date(oneWeekAgo)) {
        results.push({ userId: user.user_id, status: 'skipped', reason: 'Already sent this week' });
        continue;
      }

      // Get weekly stats using the database function
      const { data: stats, error: statsError } = await supabase
        .rpc('get_weekly_stats', { p_user_id: user.user_id });

      if (statsError) {
        results.push({ userId: user.user_id, status: 'error', error: statsError.message });
        continue;
      }

      const weeklyStats = stats?.[0] || {
        total_completed: 0,
        urgent_important_count: 0,
        urgent_not_important_count: 0,
        not_urgent_important_count: 0,
        not_urgent_not_important_count: 0,
        current_streak: 0,
        longest_streak: 0,
      };

      // Skip if no activity this week
      if (weeklyStats.total_completed === 0) {
        results.push({ userId: user.user_id, status: 'skipped', reason: 'No activity this week' });
        continue;
      }

      // Send weekly summary email
      const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
      
      const emailResponse = await fetch(sendEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          type: 'weekly-summary',
          userId: user.user_id,
          email: user.email,
          data: {
            totalCompleted: weeklyStats.total_completed,
            urgentImportant: weeklyStats.urgent_important_count,
            urgentNotImportant: weeklyStats.urgent_not_important_count,
            notUrgentImportant: weeklyStats.not_urgent_important_count,
            notUrgentNotImportant: weeklyStats.not_urgent_not_important_count,
            currentStreak: weeklyStats.current_streak,
            longestStreak: weeklyStats.longest_streak,
          },
        }),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        results.push({ userId: user.user_id, status: 'error', error: errorText });
        continue;
      }

      // Update last weekly report timestamp
      const { error: updateError } = await supabase
        .from('user_notifications')
        .update({ last_weekly_report: new Date().toISOString() })
        .eq('user_id', user.user_id);

      if (updateError) {
        results.push({ userId: user.user_id, status: 'error', error: updateError.message });
        continue;
      }

      results.push({ 
        userId: user.user_id, 
        status: 'success', 
        tasksCompleted: weeklyStats.total_completed 
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
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
