// Authentication routes
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import dotenv from 'dotenv';
import { z } from 'zod';
import { getPool } from '../config/database';
import { 
  UserWithoutPassword, 
  ApiResponse, 
  LoginRequest, 
  SignupRequest,
  TokenPayload 
} from '../types/index';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

dotenv.config();

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Validation schemas
const loginSchema = z.object({
  mobile: z.string().min(10, 'Mobile must be at least 10 digits'),
  password: z.string().min(1, 'Password is required'),
});

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  mobile: z.string().min(10, 'Mobile must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'sub-admin', 'manager', 'hr', 'employee']).optional(),
});

// Generate JWT token
function generateToken(user: UserWithoutPassword): string {
  const payload: TokenPayload = {
    userId: user.id,
    mobile: user.mobile,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
}

// Format user response
function formatUserResponse(user: {
  id: number;
  name: string;
  email: string;
  mobile: string;
  role: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}): UserWithoutPassword {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role as UserWithoutPassword['role'],
    isActive: Boolean(user.is_active),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * POST /api/auth/login
 * Login with mobile and password
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request
    const validatedData = loginSchema.parse(req.body) as LoginRequest;
    const { mobile, password } = validatedData;

    // Find user by mobile
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE mobile = ?',
      [mobile]
    );

    const users = rows as Array<{
      id: number;
      name: string;
      email: string;
      mobile: string;
      password: string;
      role: string;
      is_active: number;
      created_at: Date;
      updated_at: Date;
    }>;

    if (users.length === 0) {
      throw new AppError('Invalid mobile number or password', 401);
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      throw new AppError('Your account has been deactivated', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppError('Invalid mobile number or password', 401);
    }

    // Generate token
    const userWithoutPassword = formatUserResponse(user);
    const token = generateToken(userWithoutPassword);

    // Send response
    const response: ApiResponse = {
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        token,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
  }
});

/**
 * POST /api/auth/signup
 * Register a new user
 */
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request
    const validatedData = signupSchema.parse(req.body) as SignupRequest;
    const { name, email, mobile, password, role } = validatedData;

    // Check if user already exists
    const pool = getPool();
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE mobile = ? OR email = ?',
      [mobile, email]
    );

    if ((existingUsers as Array<{ id: number }>).length > 0) {
      throw new AppError('User with this mobile or email already exists', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, mobile, password, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, mobile, hashedPassword, role || 'employee']
    );

    // Get the created user
    const [newUserRows] = await pool.execute(
      'SELECT * FROM users WHERE id = ?',
      [(result as { insertId: number }).insertId]
    );

    const newUser = (newUserRows as Array<{
      id: number;
      name: string;
      email: string;
      mobile: string;
      role: string;
      is_active: number;
      created_at: Date;
      updated_at: Date;
    }>)[0];

    const userWithoutPassword = formatUserResponse(newUser);
    const token = generateToken(userWithoutPassword);

    const response: ApiResponse = {
      success: true,
      message: 'Account created successfully',
      data: {
        user: userWithoutPassword,
        token,
      },
    };

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
  }
});

/**
 * GET /api/auth/me
 * Get current user (protected route) - works for both users and employees
 */
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Check if it's a regular user or an employee
    if (req.user) {
      const response: ApiResponse = {
        success: true,
        data: {
          user: req.user,
        },
      };
      return res.status(200).json(response);
    }
    
    // It's an employee
    if (req.employee) {
      const response: ApiResponse = {
        success: true,
        data: {
          employee: req.employee,
        },
      };
      return res.status(200).json(response);
    }
    
    throw new AppError('User not found', 404);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal)
 */
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const response: ApiResponse = {
      success: true,
      message: 'Logout successful',
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/password
 * Change password (protected route)
 */
router.put('/password', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Current password and new password are required', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters', 400);
    }

    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT password FROM users WHERE id = ?',
      [req.user!.id]
    );

    const users = rows as Array<{ password: string }>;
    const user = users[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.user!.id]
    );

    const response: ApiResponse = {
      success: true,
      message: 'Password updated successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
