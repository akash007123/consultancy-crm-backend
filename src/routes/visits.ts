// Visit management routes
import { Router, Response, NextFunction, Request } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  Visit,
  VisitWithoutRelations,
  CreateVisitRequest,
  UpdateVisitRequest,
  VisitListItem,
  ApiResponse
} from '../types/index';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating visit
const createVisitSchema = z.object({
  clientId: z.number().int().positive('Client is required'),
  employeeId: z.number().int().positive('Employee is required'),
  date: z.string().min(1, 'Date is required'),
  checkInTime: z.string().min(1, 'Check-in time is required'),
  checkOutTime: z.string().nullable().optional(),
  location: z.string().min(1, 'Location is required'),
  remarks: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  nextFollowup: z.string().nullable().optional(),
});

// Validation schema for updating visit
const updateVisitSchema = createVisitSchema.partial();

// Helper function to transform database row to VisitListItem
function transformToVisitListItem(row: VisitWithoutRelations & { client_name?: string; employee_name?: string }): VisitListItem {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name || 'Unknown Client',
    employeeId: row.employee_id,
    employeeName: row.employee_name || 'Unknown Employee',
    date: row.date,
    checkIn: row.check_in_time,
    checkOut: row.check_out_time,
    location: row.location,
    remarks: row.remarks,
  };
}

// GET /api/visits - Get all visits
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    
    const { startDate, endDate, employeeId, clientId } = req.query;
    
    let query = `
      SELECT 
        v.*,
        u.name as client_name,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name
      FROM visits v
      LEFT JOIN users u ON v.client_id = u.id
      LEFT JOIN employees e ON v.employee_id = e.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND v.date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND v.date <= ?';
      params.push(endDate);
    }
    
    if (employeeId) {
      query += ' AND v.employee_id = ?';
      params.push(employeeId);
    }
    
    if (clientId) {
      query += ' AND v.client_id = ?';
      params.push(clientId);
    }
    
    query += ' ORDER BY v.date DESC, v.check_in_time DESC';
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);
    
    const visits = rows.map(row => transformToVisitListItem(row as any));
    
    res.json({
      success: true,
      data: { visits }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/visits/:id - Get single visit
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT 
        v.*,
        u.name as client_name,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name
      FROM visits v
      LEFT JOIN users u ON v.client_id = u.id
      LEFT JOIN employees e ON v.employee_id = e.id
      WHERE v.id = ?`,
      [id]
    );
    
    if (rows.length === 0) {
      throw new AppError('Visit not found', 404);
    }
    
    const row = rows[0] as VisitWithoutRelations & { client_name?: string; employee_name?: string };
    
    const visit: Visit = {
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name || 'Unknown Client',
      employeeId: row.employee_id,
      employeeName: row.employee_name || 'Unknown Employee',
      date: row.date,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      location: row.location,
      remarks: row.remarks,
      purpose: row.purpose,
      outcome: row.outcome,
      nextFollowup: row.next_followup,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    
    res.json({
      success: true,
      data: { visit }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/visits - Create new visit
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validatedData = createVisitSchema.parse(req.body);
    
    const pool = getPool();
    
    // Verify client exists
    const [clientRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, name FROM users WHERE id = ?',
      [validatedData.clientId]
    );
    
    if (clientRows.length === 0) {
      throw new AppError('Client not found', 404);
    }
    
    // Verify employee exists
    const [employeeRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, first_name, last_name FROM employees WHERE id = ?',
      [validatedData.employeeId]
    );
    
    if (employeeRows.length === 0) {
      throw new AppError('Employee not found', 404);
    }
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO visits (client_id, employee_id, date, check_in_time, check_out_time, location, remarks, purpose, outcome, next_followup)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        validatedData.clientId,
        validatedData.employeeId,
        validatedData.date,
        validatedData.checkInTime,
        validatedData.checkOutTime || null,
        validatedData.location,
        validatedData.remarks || null,
        validatedData.purpose || null,
        validatedData.outcome || null,
        validatedData.nextFollowup || null,
      ]
    );
    
    // Fetch the created visit
    const [newVisitRows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT 
        v.*,
        u.name as client_name,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name
      FROM visits v
      LEFT JOIN users u ON v.client_id = u.id
      LEFT JOIN employees e ON v.employee_id = e.id
      WHERE v.id = ?`,
      [result.insertId]
    );
    
    const row = newVisitRows[0] as VisitWithoutRelations & { client_name?: string; employee_name?: string };
    
    const visit: Visit = {
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name || 'Unknown Client',
      employeeId: row.employee_id,
      employeeName: row.employee_name || 'Unknown Employee',
      date: row.date,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      location: row.location,
      remarks: row.remarks,
      purpose: row.purpose,
      outcome: row.outcome,
      nextFollowup: row.next_followup,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    
    res.status(201).json({
      success: true,
      message: 'Visit logged successfully',
      data: { visit }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
  }
});

// PUT /api/visits/:id - Update visit
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = updateVisitSchema.parse(req.body);
    
    const pool = getPool();
    
    // Check if visit exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM visits WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Visit not found', 404);
    }
    
    // If clientId is being updated, verify it exists
    if (validatedData.clientId) {
      const [clientRows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM users WHERE id = ?',
        [validatedData.clientId]
      );
      
      if (clientRows.length === 0) {
        throw new AppError('Client not found', 404);
      }
    }
    
    // If employeeId is being updated, verify it exists
    if (validatedData.employeeId) {
      const [employeeRows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM employees WHERE id = ?',
        [validatedData.employeeId]
      );
      
      if (employeeRows.length === 0) {
        throw new AppError('Employee not found', 404);
      }
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    
    if (validatedData.clientId !== undefined) {
      updates.push('client_id = ?');
      params.push(validatedData.clientId);
    }
    if (validatedData.employeeId !== undefined) {
      updates.push('employee_id = ?');
      params.push(validatedData.employeeId);
    }
    if (validatedData.date !== undefined) {
      updates.push('date = ?');
      params.push(validatedData.date);
    }
    if (validatedData.checkInTime !== undefined) {
      updates.push('check_in_time = ?');
      params.push(validatedData.checkInTime);
    }
    if (validatedData.checkOutTime !== undefined) {
      updates.push('check_out_time = ?');
      params.push(validatedData.checkOutTime);
    }
    if (validatedData.location !== undefined) {
      updates.push('location = ?');
      params.push(validatedData.location);
    }
    if (validatedData.remarks !== undefined) {
      updates.push('remarks = ?');
      params.push(validatedData.remarks);
    }
    if (validatedData.purpose !== undefined) {
      updates.push('purpose = ?');
      params.push(validatedData.purpose);
    }
    if (validatedData.outcome !== undefined) {
      updates.push('outcome = ?');
      params.push(validatedData.outcome);
    }
    if (validatedData.nextFollowup !== undefined) {
      updates.push('next_followup = ?');
      params.push(validatedData.nextFollowup);
    }
    
    if (updates.length > 0) {
      params.push(id);
      await pool.execute(
        `UPDATE visits SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }
    
    // Fetch the updated visit
    const [updatedRows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT 
        v.*,
        u.name as client_name,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name
      FROM visits v
      LEFT JOIN users u ON v.client_id = u.id
      LEFT JOIN employees e ON v.employee_id = e.id
      WHERE v.id = ?`,
      [id]
    );
    
    const row = updatedRows[0] as VisitWithoutRelations & { client_name?: string; employee_name?: string };
    
    const visit: Visit = {
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name || 'Unknown Client',
      employeeId: row.employee_id,
      employeeName: row.employee_name || 'Unknown Employee',
      date: row.date,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      location: row.location,
      remarks: row.remarks,
      purpose: row.purpose,
      outcome: row.outcome,
      nextFollowup: row.next_followup,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    
    res.json({
      success: true,
      message: 'Visit updated successfully',
      data: { visit }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
  }
});

// DELETE /api/visits/:id - Delete visit
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    
    // Check if visit exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM visits WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Visit not found', 404);
    }
    
    await pool.execute('DELETE FROM visits WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Visit deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/visits/clients/list - Get list of clients for dropdown
router.get('/clients/list', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, name, email, mobile FROM users ORDER BY name ASC'
    );
    
    res.json({
      success: true,
      data: { clients: rows }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/visits/employees/list - Get list of employees for dropdown
router.get('/employees/list', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, employee_code, first_name, last_name, department, status 
       FROM employees 
       WHERE status = 'active' 
       ORDER BY first_name ASC, last_name ASC`
    );
    
    const employees = rows.map(row => ({
      id: row.id,
      employeeCode: row.employee_code,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: `${row.first_name} ${row.last_name}`,
      department: row.department,
      status: row.status,
    }));
    
    res.json({
      success: true,
      data: { employees }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
