import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Validation helpers
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password: string): boolean => {
  return password.length >= 6;
};

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long',
      });
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser && !checkError) {
      return res.status(409).json({
        success: false,
        error: 'User already exists with this email',
      });
    }

    // If error is not "no rows found", it's a real error
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('User check error:', checkError);
      return res.status(500).json({
        success: false,
        error: 'Failed to check user existence',
      });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || email.split('@')[0],
        }
      }
    });

    if (authError) {
      console.error('Supabase auth error:', authError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create user account',
      });
    }

    if (!authData.user) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create user account',
      });
    }

    // Create user profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName || email.split('@')[0],
        role: 'Task Manager',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile creation error:', profileError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create user profile',
      });
    }

    // Generate JWT token for our API
    const token = jwt.sign(
      {
        id: profileData.id,
        email: profileData.email,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: profileData.id,
          email: profileData.email,
          fullName: profileData.full_name,
          role: profileData.role,
        },
        token,
      },
      message: 'User registered successfully',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Login user
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // For now, we'll use Supabase auth for login
    // In production, you might want to handle password verification here
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: profile.id,
        email: profile.email,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    res.json({
      success: true,
      data: {
        user: {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          role: profile.role,
        },
        token,
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user!.id)
      .single();

    if (error || !profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          role: profile.role,
          createdAt: profile.created_at,
        },
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { fullName, role } = req.body;

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        role: role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.user!.id)
      .select()
      .single();

    if (error) {
      console.error('Update profile error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update profile',
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          role: profile.role,
        },
      },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Logout (client-side token removal is sufficient, but we can log the action)
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    // In a production app, you might want to blacklist the token
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;