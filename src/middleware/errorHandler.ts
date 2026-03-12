// Custom error handling middleware
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  console.error('Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Handle MySQL duplicate entry error
  if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
    res.status(409).json({
      success: false,
      error: 'A record with this information already exists',
    });
    return;
  }

  // Handle validation errors
  if ((err as { name?: string }).name === 'ZodError') {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: (err as { errors?: unknown }).errors,
    });
    return;
  }

  // Default server error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Internal server error',
  });
};
