// Petrol Allowance management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  PetrolAllowance,
  PetrolAllowanceWithoutRelations,
  CreatePetrolAllowanceRequest,
  UpdatePetrolAllowanceRequest,
  PetrolAllowanceStatus,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating petrol allowance
const createPetrolAllowanceSchema = z.object({
  employeeId: z.number().int().positive('Employee is required'),
  distance: z.number().positive('Distance must be a positive number'),
  rate: z.number().positive('Rate must be a positive number'),
  date: z.string().min(1, 'Date is required'),
  status: z.enum(['Approved', 'Pending']).optional().default('Pending')
});

// Validation schema for updating petrol allowance
const updatePetrolAllowanceSchema = z.object({
  id: z.number().int().positive('Valid petrol allowance ID is required'),
  employeeId: z.number().int().positive().optional(),
  distance: z.number().positive().optional(),
  rate: z.number().positive().optional(),
  date: z.string().min(1).optional(),
  status: z.enum(['Approved', 'Pending']).optional()
});

// Helper function to transform database row to PetrolAllowance object
async function transformPetrolAllowance(row: PetrolAllowanceWithoutRelations): Promise<PetrolAllowance> {
  const pool = getPool();
  
  // Get employee name
  const [employeeRows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT first_name, last_name FROM employees WHERE id = ?',
    [row.employee_id]
  );
  
  const employeeName = employeeRows.length > 0 
    ? `${employeeRows[0].first_name} ${employeeRows[0].last_name}`
    : 'Unknown Employee';
  
  const total = row.distance * row.rate;
  
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName,
    distance: row.distance,
    rate: row.rate,
    total,
    date: row.date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/petrol-allowance - Get all petrol allowances
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM petrol_allowance ORDER BY date DESC, created_at DESC
    `);
    
    const petrolAllowances: PetrolAllowance[] = await Promise.all(
      rows.map(row => transformPetrolAllowance(row as PetrolAllowanceWithoutRelations))
    );
    
    res.json({
      success: true,
      data: {
        petrolAllowances
      }
    });
  } catch (error) {
    console.error('Error fetching petrol allowances:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch petrol allowances'
    });
  }
});

// GET /api/petrol-allowance/:id - Get single petrol allowance by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const petrolAllowanceId = parseInt(req.params.id);
    
    if (isNaN(petrolAllowanceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid petrol allowance ID'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM petrol_allowance WHERE id = ?
    `, [petrolAllowanceId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Petrol allowance not found'
      });
    }
    
    const petrolAllowance = await transformPetrolAllowance(rows[0] as PetrolAllowanceWithoutRelations);
    
    res.json({
      success: true,
      data: {
        petrolAllowance
      }
    });
  } catch (error) {
    console.error('Error fetching petrol allowance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch petrol allowance'
    });
  }
});

// POST /api/petrol-allowance - Create new petrol allowance
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = createPetrolAllowanceSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { employeeId, distance, rate, date, status }: CreatePetrolAllowanceRequest = validationResult.data;
    const pool = getPool();
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      INSERT INTO petrol_allowance (employee_id, distance, rate, date, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    `, [employeeId, distance, rate, date, status || 'Pending']);
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM petrol_allowance WHERE id = ?
    `, [result.insertId]);
    
    if (rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve created petrol allowance'
      });
    }
    
    const petrolAllowance = await transformPetrolAllowance(rows[0] as PetrolAllowanceWithoutRelations);
    
    res.status(201).json({
      success: true,
      message: 'Petrol allowance created successfully',
      data: {
        petrolAllowance
      }
    });
  } catch (error) {
    console.error('Error creating petrol allowance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create petrol allowance'
    });
  }
});

// PUT /api/petrol-allowance/:id - Update petrol allowance
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const petrolAllowanceId = parseInt(req.params.id);
    
    if (isNaN(petrolAllowanceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid petrol allowance ID'
      });
    }
    
    const validationResult = updatePetrolAllowanceSchema.safeParse({
      id: petrolAllowanceId,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { employeeId, distance, rate, date, status }: UpdatePetrolAllowanceRequest = validationResult.data;
    const pool = getPool();
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    
    if (employeeId !== undefined) {
      updates.push('employee_id = ?');
      values.push(employeeId);
    }
    if (distance !== undefined) {
      updates.push('distance = ?');
      values.push(distance);
    }
    if (rate !== undefined) {
      updates.push('rate = ?');
      values.push(rate);
    }
    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push('updated_at = NOW()');
    values.push(petrolAllowanceId);
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      UPDATE petrol_allowance SET ${updates.join(', ')} WHERE id = ?
    `, values);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Petrol allowance not found'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM petrol_allowance WHERE id = ?
    `, [petrolAllowanceId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Petrol allowance not found'
      });
    }
    
    const petrolAllowance = await transformPetrolAllowance(rows[0] as PetrolAllowanceWithoutRelations);
    
    res.json({
      success: true,
      message: 'Petrol allowance updated successfully',
      data: {
        petrolAllowance
      }
    });
  } catch (error) {
    console.error('Error updating petrol allowance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update petrol allowance'
    });
  }
});

// DELETE /api/petrol-allowance/:id - Delete petrol allowance
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const petrolAllowanceId = parseInt(req.params.id);
    
    if (isNaN(petrolAllowanceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid petrol allowance ID'
      });
    }
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      DELETE FROM petrol_allowance WHERE id = ?
    `, [petrolAllowanceId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Petrol allowance not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Petrol allowance deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting petrol allowance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete petrol allowance'
    });
  }
});

export default router;
