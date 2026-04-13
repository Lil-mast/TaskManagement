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

    const { userId, taskId, quadrant } = await req.json();

    if (!userId || !taskId || !quadrant) {
      throw new Error('Missing required fields: userId, taskId, quadrant');
    }

    // Insert task completion record
    const { data: completion, error: completionError } = await supabase
      .from('task_completions')
      .insert({
        user_id: userId,
        task_id: taskId,
        quadrant: quadrant,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (completionError) {
      throw new Error(`Failed to record completion: ${completionError.message}`);
    }

    // Get current streak info
    const { data: streakData, error: streakError } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (streakError && streakError.code !== 'PGRST116') { // PGRST116 = no rows
      throw new Error(`Failed to fetch streak: ${streakError.message}`);
    }

    const currentStreak = streakData?.current_streak || 0;
    const longestStreak = streakData?.longest_streak || 0;
    const lastCompletionDate = streakData?.last_completion_date;

    // Calculate if milestone reached (7-day streak)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    let newStreak = 1;
    let milestoneReached = false;

    if (lastCompletionDate === today) {
      // Already completed today, streak unchanged
      newStreak = currentStreak;
    } else if (lastCompletionDate === yesterday) {
      // Consecutive day
      newStreak = currentStreak + 1;
      // Check for 7-day milestone
      if (newStreak === 7 && currentStreak < 7) {
        milestoneReached = true;
      }
    }
    // If not today or yesterday, streak reset to 1 (handled in newStreak initialization)

    // Update or insert streak record
    const { error: upsertError } = await supabase
      .from('user_streaks')
      .upsert({
        user_id: userId,
        current_streak: newStreak,
        longest_streak: Math.max(longestStreak, newStreak),
        last_completion_date: today,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      throw new Error(`Failed to update streak: ${upsertError.message}`);
    }

    // If milestone reached, trigger email notification
    if (milestoneReached) {
      // Get user email from user_notifications
      const { data: userNotif } = await supabase
        .from('user_notifications')
        .select('email, streak_milestone_7_sent')
        .eq('user_id', userId)
        .single();

      if (userNotif?.email && !userNotif.streak_milestone_7_sent) {
        // Call the send-email function
        const sendEmailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`;
        
        await fetch(sendEmailUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            type: 'streak-milestone',
            userId,
            email: userNotif.email,
            data: { streak: 7 },
          }),
        });

        // Mark milestone email as sent
        await supabase
          .from('user_notifications')
          .update({ streak_milestone_7_sent: true })
          .eq('user_id', userId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        completion,
        streak: {
          current: newStreak,
          longest: Math.max(longestStreak, newStreak),
          milestoneReached,
        },
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
