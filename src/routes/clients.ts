// Client management routes
import { Router, Response, NextFunction, Request } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import { Client, CreateClientRequest, UpdateClientRequest, ApiResponse } from '../types/index';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating client
const createClientSchema = z.object({
  clientName: z.string().min(1, 'Client name is required'),
  companyName: z.string().min(1, 'Company name is required'),
  mobile: z.string().min(10, 'Mobile number is required'),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  industry: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  profilePhoto: z.string().optional().or(z.literal('')),
});

// Validation schema for updating client
const updateClientSchema = z.object({
  id: z.number(),
  clientName: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  mobile: z.string().min(10).optional(),
  email: z.string().email().optional().or(z.literal('')),
  industry: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  profilePhoto: z.string().optional().or(z.literal('')),
});

// Format date helper function
function formatDate(date: unknown): string {
  if (!date) return '';
  const d = new Date(date as string);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

// Format database row to Client
function formatClient(row: Record<string, unknown>): Client {
  return {
    id: row.id as number,
    clientName: row.client_name as string,
    companyName: row.company_name as string,
    mobile: row.mobile as string,
    email: row.email as string | null,
    industry: row.industry as string | null,
    address: row.address as string | null,
    profilePhoto: row.profile_photo as string | null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

// GET /api/clients - Get all clients
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const search = req.query.search as string | undefined;
    
    let query = 'SELECT * FROM clients WHERE 1=1';
    const params: (string | number)[] = [];
    
    if (search) {
      query += ' AND (client_name LIKE ? OR company_name LIKE ? OR mobile LIKE ? OR email LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);
    const clients = rows.map(formatClient);
    
    res.json({
      success: true,
      data: {
        clients,
        total: clients.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/clients/:id - Get client by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const clientId = parseInt(req.params.id, 10);
    
    if (isNaN(clientId)) {
      throw new AppError('Invalid client ID', 400);
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM clients WHERE id = ?',
      [clientId]
    );
    
    if (rows.length === 0) {
      throw new AppError('Client not found', 404);
    }
    
    const client = formatClient(rows[0]);
    
    res.json({
      success: true,
      data: {
        client,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/clients - Create new client
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validatedData = createClientSchema.parse(req.body);
    
    const pool = getPool();
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO clients (client_name, company_name, mobile, email, industry, address, profile_photo, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        validatedData.clientName,
        validatedData.companyName,
        validatedData.mobile,
        validatedData.email || null,
        validatedData.industry || null,
        validatedData.address || null,
        validatedData.profilePhoto || null,
      ]
    );
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM clients WHERE id = ?',
      [result.insertId]
    );
    
    const client = formatClient(rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: {
        client,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'Validation failed',
        details: validationErrors,
      });
      return;
    }
    next(error);
  }
});

// PUT /api/clients/:id - Update client
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    
    if (isNaN(clientId)) {
      throw new AppError('Invalid client ID', 400);
    }
    
    const validatedData = updateClientSchema.parse({ ...req.body, id: clientId });
    
    const pool = getPool();
    
    // Check if client exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM clients WHERE id = ?',
      [clientId]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Client not found', 404);
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    
    if (validatedData.clientName !== undefined) {
      updates.push('client_name = ?');
      params.push(validatedData.clientName);
    }
    if (validatedData.companyName !== undefined) {
      updates.push('company_name = ?');
      params.push(validatedData.companyName);
    }
    if (validatedData.mobile !== undefined) {
      updates.push('mobile = ?');
      params.push(validatedData.mobile);
    }
    if (validatedData.email !== undefined) {
      updates.push('email = ?');
      params.push(validatedData.email || null);
    }
    if (validatedData.industry !== undefined) {
      updates.push('industry = ?');
      params.push(validatedData.industry || null);
    }
    if (validatedData.address !== undefined) {
      updates.push('address = ?');
      params.push(validatedData.address || null);
    }
    if (validatedData.profilePhoto !== undefined) {
      updates.push('profile_photo = ?');
      params.push(validatedData.profilePhoto || null);
    }
    
    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }
    
    params.push(clientId);
    
    await pool.execute(
      `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM clients WHERE id = ?',
      [clientId]
    );
    
    const client = formatClient(rows[0]);
    
    res.json({
      success: true,
      message: 'Client updated successfully',
      data: {
        client,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'Validation failed',
        details: validationErrors,
      });
      return;
    }
    next(error);
  }
});

// DELETE /api/clients/:id - Delete client
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const clientId = parseInt(req.params.id, 10);
    
    if (isNaN(clientId)) {
      throw new AppError('Invalid client ID', 400);
    }
    
    // Check if client exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM clients WHERE id = ?',
      [clientId]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Client not found', 404);
    }
    
    await pool.execute('DELETE FROM clients WHERE id = ?', [clientId]);
    
    res.json({
      success: true,
      message: 'Client deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/clients/:id/toggle-status - Toggle client active status
router.patch('/:id/toggle-status', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const clientId = parseInt(req.params.id, 10);
    
    if (isNaN(clientId)) {
      throw new AppError('Invalid client ID', 400);
    }
    
    // Check if client exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM clients WHERE id = ?',
      [clientId]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Client not found', 404);
    }
    
    const currentStatus = existingRows[0].is_active;
    
    await pool.execute(
      'UPDATE clients SET is_active = ? WHERE id = ?',
      [!currentStatus, clientId]
    );
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM clients WHERE id = ?',
      [clientId]
    );
    
    const client = formatClient(rows[0]);
    
    res.json({
      success: true,
      message: `Client ${client.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        client,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
