# Eisenhower Matrix Task Board

This is a code bundle for Eisenhower Matrix Task Board. The original project is available at https://www.figma.com/design/reLwOcLUQfTw9kMWsBMnfm/Eisenhower-Matrix-Task-Board.

## Quick Start (Local Mode)

The app works out of the box in **local mode** without any setup:

```bash
npm install
npm run dev
```

In local mode:
- Tasks are saved in your browser's localStorage
- No authentication required
- Perfect for testing the UI and functionality

## Supabase Integration (Optional)

For persistent, multi-device storage with user authentication:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up Supabase:
   - Create a new project at [supabase.com](https://supabase.com)
   - Go to Settings > API to get your project URL and anon key
   - Update `.env.local` with your Supabase credentials:
     ```
     VITE_SUPABASE_URL=your-project-url
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```

3. Set up Google OAuth:
   - In Supabase Dashboard, go to Authentication > Providers
   - Enable Google provider
   - Get Google Client ID and Secret from [Google Cloud Console](https://console.cloud.google.com/)
     - Create a new project or select existing
     - Enable Google+ API
     - Create OAuth 2.0 credentials
     - Add authorized redirect URIs: `https://your-project-ref.supabase.co/auth/v1/callback`
   - Enter Client ID and Secret in Supabase

4. Set up the database:
   - In Supabase Dashboard, go to SQL Editor
   - Run the SQL from `supabase-schema.sql` to create the tasks table and policies

## Running the app

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port shown in terminal).

## Features

- **Local Mode**: Works immediately with browser storage
- **Supabase Mode**: User authentication with Google, persistent storage
- **Eisenhower Matrix**: Organize tasks by urgency and importance
- **Real-time Updates**: Tasks sync across devices (in Supabase mode)