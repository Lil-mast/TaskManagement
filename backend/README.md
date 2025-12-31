# Task Management Backend

A robust REST API backend for the Eisenhower Matrix task management application, built with Node.js, Express, and TypeScript. Features authentication, task management, and user preferences with Supabase integration.

## Features

- 🔐 **Authentication**: JWT-based authentication with secure password hashing
- 📋 **Task Management**: Full CRUD operations for Eisenhower Matrix tasks
- 👤 **User Management**: User profiles, preferences, and statistics
- 🛡️ **Security**: Rate limiting, CORS, Helmet security headers, input validation
- 📊 **Analytics**: User statistics and activity tracking
- 🔄 **Real-time**: Supabase real-time subscriptions for live updates

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js with TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT with bcryptjs
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate Limiting
- **Logging**: Morgan

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account and project

### Installation

1. **Clone and navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   ```bash
   cp .env.example .env
   ```

   Fill in your `.env` file with:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173

   # Supabase Configuration
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key
   JWT_EXPIRES_IN=7d

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

4. **Database Setup:**
   Run the SQL schema in your Supabase SQL editor:
   ```sql
   -- Copy contents from supabase-schema.sql in the root directory
   ```

5. **Start the server:**
   ```bash
   # Development mode with hot reload
   npm run dev

   # Production build
   npm run build
   npm start
   ```

The API will be available at `http://localhost:3001`

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `POST /api/auth/logout` - Logout user

### Tasks
- `GET /api/tasks` - Get all user tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PUT /api/tasks/:id/complete` - Toggle task completion
- `POST /api/tasks/bulk-update` - Bulk update tasks

### Users
- `GET /api/users/stats` - Get user statistics
- `GET /api/users/preferences` - Get user preferences
- `PUT /api/users/preferences` - Update user preferences
- `GET /api/users/activity` - Get recent user activity
- `DELETE /api/users/account` - Delete user account

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── supabase.ts          # Supabase client configuration
│   ├── middleware/
│   │   ├── auth.ts              # JWT authentication middleware
│   │   ├── errorHandler.ts      # Global error handling
│   │   └── notFound.ts          # 404 handler
│   ├── routes/
│   │   ├── auth.ts              # Authentication routes
│   │   ├── tasks.ts             # Task management routes
│   │   └── users.ts             # User management routes
│   └── server.ts                # Main server file
├── .env.example                 # Environment variables template
├── package.json                 # Dependencies and scripts
└── tsconfig.json               # TypeScript configuration
```

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

### Code Quality

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting with Airbnb config
- **Prettier**: Code formatting
- **Husky**: Pre-commit hooks for quality checks

## Security Features

- **Password Hashing**: bcryptjs with salt rounds
- **JWT Tokens**: Secure token-based authentication
- **Rate Limiting**: Prevents abuse with configurable limits
- **CORS**: Configured for frontend origin
- **Helmet**: Security headers
- **Input Validation**: Joi schema validation
- **SQL Injection Protection**: Parameterized queries

## Error Handling

The API uses consistent error response format:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Use conventional commits

## License

MIT License - see LICENSE file for details