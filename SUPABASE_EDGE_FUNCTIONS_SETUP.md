# Supabase Edge Functions Setup Guide

This guide walks you through setting up and deploying the Edge Functions for notifications and progress tracking.

## Prerequisites

1. **Supabase Project**: You need an active Supabase project
2. **Resend Account**: Sign up at [resend.com](https://resend.com) for sending transactional emails
3. **Supabase CLI**: Install via Windows Package Manager

## Installation Steps

### Step 1: Install Supabase CLI (Windows)

**Option A: Using Scoop (Recommended)**
```powershell
# Install Scoop if not already installed
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression

# Install Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Option B: Using Chocolatey**
```powershell
choco install supabase
```

**Option C: Download Binary Directly**
1. Download the latest release from https://github.com/supabase/cli/releases
2. Add to your PATH

### Step 2: Login to Supabase

```bash
supabase login
```

This will open a browser window to authenticate.

### Step 3: Link Your Project

```bash
cd c:\Users\admin\desktop\taskmanagement
supabase link --project-ref <your-project-ref>
```

Find your project ref in the Supabase Dashboard URL: `https://app.supabase.com/project/<project-ref>`

### Step 4: Run Database Migrations

```bash
# Apply the migration to create streaks and notifications tables
supabase db push
```

Or manually run the SQL in `supabase/migrations/20250413000000_add_streaks_and_notifications.sql` via the Supabase SQL Editor.

### Step 5: Set Environment Variables

```bash
# Set Resend API Key (get from https://resend.com)
supabase secrets set RESEND_API_KEY=re_YOUR_API_KEY_HERE

# Set Supabase Service Role Key (get from Project Settings > API)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Verify Supabase URL is set (should be automatic)
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
```

### Step 6: Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy send-email
supabase functions deploy track-streak
supabase functions deploy welcome-user
supabase functions deploy weekly-report
```

### Step 7: Set Up Database Webhooks (Optional but Recommended)

In the Supabase Dashboard:

1. Go to **Database** → **Webhooks**
2. Click **New Webhook**
3. Create webhook for `task_completions` table:
   - Event: `INSERT`
   - Function URL: `https://your-project-ref.supabase.co/functions/v1/track-streak`

4. Create webhook for user signup (welcome email):
   - Table: `auth.users` or your custom users table
   - Event: `INSERT`
   - Function URL: `https://your-project-ref.supabase.co/functions/v1/welcome-user`

### Step 8: Set Up Cron Job for Weekly Reports

In the Supabase Dashboard:

1. Go to **Integrations** → **Cron Jobs**
2. Create a new cron job:
   - Name: `weekly-reports`
   - Schedule: `0 9 * * 1` (Every Monday at 9:00 AM)
   - HTTP Request:
     - Method: POST
     - URL: `https://your-project-ref.supabase.co/functions/v1/weekly-report`
     - Headers: `Authorization: Bearer <anon_key>`

## Resend Email Configuration

### Step 1: Verify Your Domain

1. In Resend Dashboard, go to **Domains**
2. Add and verify your domain
3. Update the `fromEmail` in `send-email` function

### Step 2: Update Sender Email

Edit `supabase/functions/send-email/index.ts`:

```typescript
// Change from:
const fromEmail = 'onboarding@resend.dev';

// To your verified domain:
const fromEmail = 'noreply@yourdomain.com';
```

Then redeploy:
```bash
supabase functions deploy send-email
```

## Testing

### Test Welcome Email

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/welcome-user \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-123", "email": "your-email@example.com"}'
```

### Test Streak Tracking

Complete a task in the app (click "Well Done"), then check the database:

```sql
SELECT * FROM user_streaks WHERE user_id = 'your-user-id';
```

### Test Weekly Report

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/weekly-report \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Environment Variables for Frontend

Add to your `.env` file:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Troubleshooting

### Function Deployment Fails

```bash
# Check function logs
supabase functions logs send-email --tail

# Redeploy with debug info
supabase functions deploy send-email --debug
```

### Emails Not Sending

1. Check Resend API key is set: `supabase secrets list`
2. Check Resend dashboard for delivery status
3. Verify you're using `onboarding@resend.dev` for testing (unless domain verified)

### Streak Not Tracking

1. Check `task_completions` table has entries
2. Verify `user_streaks` table is being updated
3. Check Edge Function logs in Supabase Dashboard

### CORS Errors

The Edge Functions already include CORS headers. If you still see issues:
1. Verify the requesting domain is allowed in your Supabase API settings
2. Check browser console for detailed error messages

## Security Notes

1. **Never commit `.env` files** with real API keys
2. **Use Row Level Security (RLS)** - Already configured in migrations
3. **Verify email addresses** in production before sending
4. **Rate limit your functions** - Supabase has built-in protections

## Monitoring

View function logs in the Supabase Dashboard:
1. Go to **Edge Functions**
2. Select your function
3. Click **Logs**

Or use CLI:
```bash
supabase functions logs <function-name> --tail
```

## Next Steps

- [ ] Verify all functions are deployed
- [ ] Test welcome email flow with real email
- [ ] Complete tasks to test streak tracking
- [ ] Wait for weekly report cron job to run (or trigger manually)
- [ ] Customize email templates in `send-email` function
- [ ] Set up custom domain in Resend for production emails
