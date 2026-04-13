import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Email templates
const welcomeEmailTemplate = (userId: string) => ({
  subject: 'Welcome to Eisenhower Matrix! 🎯',
  html: `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #FDF8F3;">
      <h1 style="color: #8B4513; text-align: center; border-bottom: 2px solid #D2691E; padding-bottom: 15px;">
        Welcome to Eisenhower Matrix!
      </h1>
      <p style="color: #5D4037; font-size: 16px; line-height: 1.6;">
        Hi there,
      </p>
      <p style="color: #5D4037; font-size: 16px; line-height: 1.6;">
        Thank you for joining <strong>Eisenhower Matrix</strong>! We're excited to help you organize your tasks by urgency and importance.
      </p>
      <div style="background: #FFF8E7; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #8B4513; margin-top: 0;">Getting Started:</h3>
        <ul style="color: #5D4037; line-height: 1.8;">
          <li>🎯 <strong>Do</strong> - Important & Urgent tasks first</li>
          <li>📅 <strong>Decide</strong> - Schedule Important but Not Urgent tasks</li>
          <li>👥 <strong>Delegate</strong> - Pass on Urgent but Not Important tasks</li>
          <li>🗑️ <strong>Delete</strong> - Eliminate Not Important & Not Urgent tasks</li>
        </ul>
      </div>
      <p style="color: #5D4037; font-size: 16px; line-height: 1.6;">
        Start building your <strong>7-day streak</strong> by completing your first task today!
      </p>
      <p style="color: #8B7355; font-size: 14px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #D2691E;">
        Happy organizing!<br>
        <em>By Software Dev Christian Tazma</em>
      </p>
    </div>
  `
});

const streakMilestoneTemplate = (streak: number, userId: string) => ({
  subject: `🎉 Amazing! You've hit a ${streak}-day streak!`,
  html: `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
      <div style="background: #FDF8F3; padding: 30px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="font-size: 60px;">🏆</span>
        </div>
        <h1 style="color: #8B4513; text-align: center; margin-bottom: 10px;">
          Incredible Achievement!
        </h1>
        <h2 style="color: #D2691E; text-align: center; margin-top: 0;">
          ${streak}-Day Streak Unlocked!
        </h2>
        <p style="color: #5D4037; font-size: 16px; line-height: 1.6; text-align: center;">
          You've been consistently crushing your tasks for <strong>${streak} days in a row</strong>! 
          Your productivity is truly inspiring.
        </p>
        <div style="background: linear-gradient(90deg, #D2691E, #8B4513); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
          <p style="font-size: 18px; margin: 0;">
            "Success is the sum of small efforts, repeated day in and day out."
          </p>
          <p style="font-size: 14px; margin: 10px 0 0 0; opacity: 0.9;">- Robert Collier</p>
        </div>
        <p style="color: #5D4037; font-size: 16px; line-height: 1.6; text-align: center;">
          Keep the momentum going! Can you reach <strong>14 days</strong>?
        </p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="#" style="background: #8B4513; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">
            Continue Your Streak →
          </a>
        </div>
        <p style="color: #8B7355; font-size: 14px; text-align: center; margin-top: 30px;">
          Congratulations on your dedication!<br>
          <em>By Software Dev Christian Tazma</em>
        </p>
      </div>
    </div>
  `
});

const weeklySummaryTemplate = (stats: {
  totalCompleted: number;
  urgentImportant: number;
  urgentNotImportant: number;
  notUrgentImportant: number;
  notUrgentNotImportant: number;
  currentStreak: number;
  longestStreak: number;
}, userId: string) => ({
  subject: '📊 Your Weekly Eisenhower Matrix Summary',
  html: `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #FDF8F3;">
      <h1 style="color: #8B4513; text-align: center; border-bottom: 2px solid #D2691E; padding-bottom: 15px;">
        Your Week in Review
      </h1>
      
      <div style="text-align: center; margin: 30px 0;">
        <div style="background: linear-gradient(135deg, #D2691E, #8B4513); color: white; padding: 25px; border-radius: 12px; display: inline-block;">
          <p style="font-size: 14px; margin: 0; text-transform: uppercase; letter-spacing: 2px;">Tasks Completed</p>
          <p style="font-size: 48px; margin: 10px 0; font-weight: bold;">${stats.totalCompleted}</p>
          <p style="font-size: 16px; margin: 0;">this week</p>
        </div>
      </div>

      <div style="background: #FFF8E7; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #8B4513; margin-top: 0;">📊 Breakdown by Quadrant:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #D2691E;">
            <td style="padding: 10px; color: #5D4037;">🔥 <strong>Do</strong> (Important & Urgent)</td>
            <td style="padding: 10px; text-align: right; color: #8B4513; font-weight: bold;">${stats.urgentImportant}</td>
          </tr>
          <tr style="border-bottom: 1px solid #D2691E;">
            <td style="padding: 10px; color: #5D4037;">📅 <strong>Decide</strong> (Important & Not Urgent)</td>
            <td style="padding: 10px; text-align: right; color: #8B4513; font-weight: bold;">${stats.notUrgentImportant}</td>
          </tr>
          <tr style="border-bottom: 1px solid #D2691E;">
            <td style="padding: 10px; color: #5D4037;">👥 <strong>Delegate</strong> (Not Important & Urgent)</td>
            <td style="padding: 10px; text-align: right; color: #8B4513; font-weight: bold;">${stats.urgentNotImportant}</td>
          </tr>
          <tr>
            <td style="padding: 10px; color: #5D4037;">🗑️ <strong>Delete</strong> (Not Important & Not Urgent)</td>
            <td style="padding: 10px; text-align: right; color: #8B4513; font-weight: bold;">${stats.notUrgentNotImportant}</td>
          </tr>
        </table>
      </div>

      <div style="background: #FFF8E7; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #8B4513; margin-top: 0;">🔥 Streak Stats:</h3>
        <div style="display: flex; justify-content: space-around; text-align: center;">
          <div>
            <p style="font-size: 32px; margin: 0; color: #D2691E; font-weight: bold;">${stats.currentStreak}</p>
            <p style="font-size: 12px; color: #5D4037; margin: 5px 0 0 0;">Current Streak</p>
          </div>
          <div>
            <p style="font-size: 32px; margin: 0; color: #D2691E; font-weight: bold;">${stats.longestStreak}</p>
            <p style="font-size: 12px; color: #5D4037; margin: 5px 0 0 0;">Longest Streak</p>
          </div>
        </div>
      </div>

      <p style="color: #5D4037; font-size: 16px; line-height: 1.6; text-align: center; margin-top: 30px;">
        Ready to make next week even better? Start by planning your tasks using the Eisenhower Matrix!
      </p>

      <p style="color: #8B7355; font-size: 14px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #D2691E;">
        Keep up the great work!<br>
        <em>By Software Dev Christian Tazma</em>
      </p>
    </div>
  `
});

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
    const { type, userId, email, data } = await req.json();
    
    // Get Resend API key from environment
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured');
    }
    
    // Determine sender email
    const fromEmail = 'onboarding@resend.dev'; // Change to your verified domain after setup

    let emailContent;
    
    switch (type) {
      case 'welcome':
        emailContent = welcomeEmailTemplate(userId);
        break;
      case 'streak-milestone':
        emailContent = streakMilestoneTemplate(data.streak || 7, userId);
        break;
      case 'weekly-summary':
        emailContent = weeklySummaryTemplate(data, userId);
        break;
      default:
        throw new Error(`Unknown email type: ${type}`);
    }

    // Send email via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Eisenhower Matrix <${fromEmail}>`,
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Resend API error: ${error}`);
    }

    const result = await res.json();

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
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
