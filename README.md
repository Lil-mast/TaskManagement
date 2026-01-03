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
- Perfect for testing UI and functionality

## Firebase + Supabase Integration (Recommended)

For persistent, multi-device storage with user authentication:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up Firebase (Authentication):
   - Create a new project at [Firebase Console](https://console.firebase.google.com/)
   - Go to Authentication > Sign-in method
   - Enable Email/Password and Google providers
   - Get Firebase configuration from Project Settings > General
   - Update `.env.local` with your Firebase credentials:
     ```
     VITE_FIREBASE_API_KEY=your-firebase-api-key
     VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your-project-id
     VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
     VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
     VITE_FIREBASE_APP_ID=your-app-id
     ```

3. Set up Supabase (Database):
   - Create a new project at [supabase.com](https://supabase.com)
   - Go to Settings > API to get your project URL and anon key
   - Update `.env.local` with your Supabase credentials:
     ```
     VITE_SUPABASE_URL=your-project-url
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```

4. Set up database:
   - In Supabase Dashboard, go to SQL Editor
   - Run the SQL from `supabase-schema.sql` to create tasks table and policies

## Running the app

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port shown in terminal).

## Features

- **Local Mode**: Works immediately with browser storage
- **Firebase Authentication**: Email/password and Google OAuth login
- **Supabase Database**: Persistent task storage across devices
- **Eisenhower Matrix**: Organize tasks by urgency and importance
- **Real-time Updates**: Tasks sync across devices (in authenticated mode)
- **Drag & Drop**: Move tasks between quadrants
- **Task Editing**: Inline editing with descriptions
- **Responsive Design**: Works on desktop and mobile