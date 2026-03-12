// JWT Authentication middleware
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getPool } from '../config/database.js';
import { UserWithoutPassword, TokenPayload } from '../types/index';
import { AppError } from './errorHandler';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthenticatedRequest extends Request {
  user?: UserWithoutPassword;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7);

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    // Get user from database
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT id, name, email, mobile, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [decoded.userId]
    );

    const users = rows as UserWithoutPassword[];

    if (users.length === 0) {
      throw new AppError('User not found', 401);
    }

    const user = users[0];

    if (!user.isActive) {
      throw new AppError('User account is disabled', 401);
    }

    // Attach user to request
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('Not authenticated', 401));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AppError('Not authorized to access this route', 403));
      return;
    }

    next();
  };
};
