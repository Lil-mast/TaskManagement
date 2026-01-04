# Eisenhower Matrix Task Management System

A beautiful, vintage-styled task management application built with React, TypeScript, and Tailwind CSS. Organize your tasks using the proven Eisenhower Matrix methodology with a stunning solar system loading animation!

## Features

### Core Functionality
- **Eisenhower Matrix**: Four-quadrant task organization (Urgent/Important, Urgent/Not Important, Not Urgent/Important, Not Urgent/Not Important)
- **Drag & Drop**: Seamlessly move tasks between quadrants
- **Task Management**: Create, edit, delete, and organize tasks with descriptions
- **Local Storage**: Works offline with browser-based storage
- **Real-time Sync**: Multi-device synchronization when authenticated

### User Experience
- **Vintage Design**: Beautiful retro styling with custom color palette
- **Solar System Loader**: Stunning animated loading experience with orbiting planets
- **Responsive Layout**: Perfect on desktop, tablet, and mobile devices
- **Smooth Animations**: Professional transitions and micro-interactions
- **Landing Page**: Beautiful introduction with personal profile section

### Authentication & Security
- **Firebase Auth**: Email/password and Google OAuth authentication
- **Supabase Backend**: Secure database with Row Level Security
- **Local Mode**: Works immediately without setup
- **Protected Credentials**: Environment variables properly secured

## Quick Start

### Option 1: Local Mode (Instant Setup)
```bash
# Clone the repository
git clone https://github.com/Lil-mast/TaskManagement.git
cd TaskManagement

# Install dependencies
npm install

# Start the app
npm run dev
```

Open `http://localhost:5173` and start organizing your tasks immediately! No configuration required.

### Option 2: Full Setup (Recommended for Production)

1. **Firebase Setup** (Authentication)
   ```bash
   # Create Firebase project at https://console.firebase.google.com/
   # Enable Email/Password and Google authentication
   # Get configuration from Project Settings > General
   ```

2. **Supabase Setup** (Database)
   ```bash
   # Create Supabase project at https://supabase.com
   # Run the SQL from supabase-schema.sql in the SQL Editor
   ```

3. **Environment Configuration**
   ```bash
   # Copy the example file
   cp .env.local.example .env.local
   
   # Add your credentials to .env.local
   VITE_FIREBASE_API_KEY=your-firebase-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Run the Application**
   ```bash
   npm run dev
   ```

## Project Structure

```
TaskManagement/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── MatrixQuadrant.tsx     # Task quadrant component
│   │   │   ├── TaskCard.tsx           # Individual task component
│   │   │   ├── DNDProvider.tsx        # Drag and drop context
│   │   │   └── SolarLoader.tsx        # Solar system loading animation
│   │   ├── App.tsx                    # Main dashboard application
│   │   ├── LandingPage.tsx            # Landing page with profile
│   │   ├── Login.tsx                  # Authentication page
│   │   ├── Signup.tsx                 # Registration page
│   │   └── UserProfile.tsx            # User profile management
│   ├── lib/
│   │   ├── auth.tsx                   # Authentication context
│   │   ├── firebase.ts                # Firebase configuration
│   │   └── supabase.ts                # Supabase client
│   └── styles/
│       ├── index.css                  # Global styles and animations
│       └── tailwind.css               # Tailwind CSS styles
├── public/
│   └── assets/
│       └── profile-image.jpg          # Profile picture for landing page
├── supabase-schema.sql                # Database schema and policies
└── README.md                          # This file
```

## Eisenhower Matrix Methodology

The Eisenhower Matrix helps you prioritize tasks based on two criteria:

1. **Urgent & Important** (Do) - Critical tasks requiring immediate attention
2. **Urgent & Not Important** (Delegate) - Tasks that can be delegated
3. **Not Urgent & Important** (Schedule) - Strategic tasks for later
4. **Not Urgent & Not Important** (Delete) - Tasks to eliminate

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Custom vintage theme
- **Authentication**: Firebase Auth
- **Database**: Supabase (PostgreSQL)
- **State Management**: React Context API
- **Drag & Drop**: React Beautiful DND
- **Icons**: Material Symbols, Font Awesome
- **Animations**: CSS3, Custom keyframes

## Development

### Available Scripts
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run test     # Run tests (when implemented)
```

### Environment Variables
The application uses the following environment variables (stored in `.env.local`):

```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Supabase Configuration
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Customization

### Vintage Theme Colors
- **Vintage Red**: `#8B4513` (Primary actions)
- **Vintage Brown**: `#654321` (Text and borders)
- **Vintage Cream**: `#F2E8D5` (Background)
- **Vintage Blue-Grey**: `#4A5568` (Secondary elements)

### Solar Loader Customization
```typescript
<SolarLoader 
  size={40}        // Sun size
  speed={1}        // Animation speed multiplier
  className="custom-class"
/>
```

## Responsive Design

- **Desktop**: Full matrix grid with all features
- **Tablet**: Optimized layout with touch interactions
- **Mobile**: Stacked quadrants with swipe gestures

## Security Features

- **Environment Protection**: `.env.local` files excluded from Git
- **Row Level Security**: Database access restricted to user data
- **Authentication**: Secure Firebase integration
- **Input Validation**: Form validation and sanitization

## Highlights

- **Solar System Loader**: Beautiful 3D animated loading experience with 8 planets orbiting the sun
- **Vintage Aesthetics**: Carefully crafted retro design with modern UX principles
- **Instant Local Mode**: Works immediately without any configuration
- **Professional Polish**: Smooth animations, hover states, and micro-interactions
- **Developer Experience**: Clean code structure, TypeScript, and modern tooling

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

## Author

**Christian Tazma** - Software Developer & AI Specialist

- Email: christiantazma77@gmail.com
- GitHub: [Lil-mast](https://github.com/Lil-mast)
- LinkedIn: https://www.linkedin.com/in/christian-tazma-3b39342a2/

---

Star this repository if it helped you organize your tasks!

Built with passion for productivity and beautiful design
