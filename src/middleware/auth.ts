// JWT Authentication middleware
import { Request, Response, NextFunction } from 'express';
import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getPool } from '../config/database.js';
import { UserWithoutPassword, TokenPayload } from '../types/index';
import { AppError } from './errorHandler';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Extended token payload to include type
interface ExtendedTokenPayload extends TokenPayload {
  type?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: UserWithoutPassword;
  employee?: {
    id: number;
    employeeCode: string;
    firstName: string;
    lastName: string;
    email: string;
    mobile1: string;
    role: string;
    isActive: boolean;
  };
}

// Check if token belongs to an employee
async function getEmployeeById(employeeId: number) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT id, employee_code, first_name, last_name, email, mobile1, role, status FROM employees WHERE id = ?',
    [employeeId]
  );
  
  const employees = rows as Array<{
    id: number;
    employee_code: string;
    first_name: string;
    last_name: string;
    email: string;
    mobile1: string;
    role: string;
    status: string;
  }>;
  
  return employees.length > 0 ? employees[0] : null;
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
    const decoded = jwt.verify(token, JWT_SECRET) as ExtendedTokenPayload;

    const pool = getPool();
    
    // If token type is 'employee', only check employees table
    if (decoded.type === 'employee') {
      const employee = await getEmployeeById(decoded.userId);
      
      if (!employee) {
        throw new AppError('User not found', 401);
      }

      if (employee.status !== 'active') {
        throw new AppError('Employee account is disabled', 401);
      }

      // Attach employee to request
      req.employee = {
        id: employee.id,
        employeeCode: employee.employee_code,
        firstName: employee.first_name,
        lastName: employee.last_name,
        email: employee.email,
        mobile1: employee.mobile1,
        role: employee.role,
        isActive: employee.status === 'active',
      };
      
      return next();
    }
    
    // Otherwise (for regular users), first try to find user in users table
    const [userRows] = await pool.execute(
      'SELECT id, name, email, mobile, role, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?',
      [decoded.userId]
    );

    const users = userRows as UserWithoutPassword[];

    if (users.length > 0) {
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
      
      return next();
    }

    // If not found in users, try employees table (for backwards compatibility)
    const employee = await getEmployeeById(decoded.userId);
    
    if (!employee) {
      throw new AppError('User not found', 401);
    }

    if (employee.status !== 'active') {
      throw new AppError('Employee account is disabled', 401);
    }

    // Attach employee to request
    req.employee = {
      id: employee.id,
      employeeCode: employee.employee_code,
      firstName: employee.first_name,
      lastName: employee.last_name,
      email: employee.email,
      mobile1: employee.mobile1,
      role: employee.role,
      isActive: employee.status === 'active',
    };

    next();
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else if (error instanceof TokenExpiredError) {
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
