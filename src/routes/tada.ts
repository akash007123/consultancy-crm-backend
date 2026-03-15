// TA/DA management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  TADA,
  TADAWithoutRelations,
  CreateTADARequest,
  UpdateTADARequest,
  ApprovalStatus,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating TA/DA
const createTADASchema = z.object({
  employeeId: z.number().int().positive('Employee is required'),
  ta: z.number().min(0, 'TA must be a non-negative number'),
  da: z.number().min(0, 'DA must be a non-negative number'),
  date: z.string().min(1, 'Date is required'),
  approval: z.enum(['Approved', 'Pending (Manager)', 'Pending (Admin)']).optional().default('Pending (Manager)')
});

// Validation schema for updating TA/DA
const updateTADASchema = z.object({
  id: z.number().int().positive('Valid TA/DA ID is required'),
  employeeId: z.number().int().positive('Employee is required').optional(),
  ta: z.number().min(0, 'TA must be a non-negative number').optional(),
  da: z.number().min(0, 'DA must be a non-negative number').optional(),
  date: z.string().min(1, 'Date is required').optional(),
  approval: z.enum(['Approved', 'Pending (Manager)', 'Pending (Admin)']).optional()
});

// Helper function to transform database row to TADA object
function transformTADA(row: TADAWithoutRelations, employeeName: string): TADA {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: employeeName,
    ta: row.ta,
    da: row.da,
    total: row.ta + row.da,
    date: row.date,
    approval: row.approval,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/tada - Get all TA/DA entries
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        t.*,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name
      FROM tada t
      LEFT JOIN employees e ON t.employee_id = e.id
      ORDER BY t.date DESC, t.created_at DESC
    `);
    
    const tadaEntries: TADA[] = rows.map(row => 
      transformTADA(row as TADAWithoutRelations, row.employee_name || 'Unknown')
    );
    
    res.json({
      success: true,
      data: {
        tadaEntries
      }
    });
  } catch (error) {
    console.error('Error fetching TA/DA entries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch TA/DA entries'
    });
  }
});

// GET /api/tada/:id - Get single TA/DA entry by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const tadaId = parseInt(req.params.id);
    
    if (isNaN(tadaId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TA/DA ID'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        t.*,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name
      FROM tada t
      LEFT JOIN employees e ON t.employee_id = e.id
      WHERE t.id = ?
    `, [tadaId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'TA/DA entry not found'
      });
    }
    
    const tadaEntry = transformTADA(rows[0] as TADAWithoutRelations, rows[0].employee_name || 'Unknown');
    
    res.json({
      success: true,
      data: {
        tadaEntry
      }
    });
  } catch (error) {
    console.error('Error fetching TA/DA entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch TA/DA entry'
    });
  }
});

// POST /api/tada - Create new TA/DA entry
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = createTADASchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { employeeId, ta, da, date, approval }: CreateTADARequest = validationResult.data;
    const pool = getPool();
    
    // Verify employee exists
    const [employeeRows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT id FROM employees WHERE id = ?
    `, [employeeId]);
    
    if (employeeRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Employee not found'
      });
    }
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      INSERT INTO tada (employee_id, ta, da, date, approval, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    `, [employeeId, ta, da, date, approval || 'Pending (Manager)']);
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        t.*,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name
      FROM tada t
      LEFT JOIN employees e ON t.employee_id = e.id
      WHERE t.id = ?
    `, [result.insertId]);
    
    if (rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve created TA/DA entry'
      });
    }
    
    const tadaEntry = transformTADA(rows[0] as TADAWithoutRelations, rows[0].employee_name || 'Unknown');
    
    res.status(201).json({
      success: true,
      message: 'TA/DA entry created successfully',
      data: {
        tadaEntry
      }
    });
  } catch (error) {
    console.error('Error creating TA/DA entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create TA/DA entry'
    });
  }
});

// PUT /api/tada/:id - Update TA/DA entry
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tadaId = parseInt(req.params.id);
    
    if (isNaN(tadaId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TA/DA ID'
      });
    }
    
    const validationResult = updateTADASchema.safeParse({
      id: tadaId,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { employeeId, ta, da, date, approval }: UpdateTADARequest = validationResult.data;
    const pool = getPool();
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    
    if (employeeId !== undefined) {
      // Verify employee exists
      const [employeeRows] = await pool.execute<mysql.RowDataPacket[]>(`
        SELECT id FROM employees WHERE id = ?
      `, [employeeId]);
      
      if (employeeRows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Employee not found'
        });
      }
      
      updates.push('employee_id = ?');
      values.push(employeeId);
    }
    if (ta !== undefined) {
      updates.push('ta = ?');
      values.push(ta);
    }
    if (da !== undefined) {
      updates.push('da = ?');
      values.push(da);
    }
    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (approval !== undefined) {
      updates.push('approval = ?');
      values.push(approval);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push('updated_at = NOW()');
    values.push(tadaId);
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      UPDATE tada SET ${updates.join(', ')} WHERE id = ?
    `, values);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'TA/DA entry not found'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        t.*,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name
      FROM tada t
      LEFT JOIN employees e ON t.employee_id = e.id
      WHERE t.id = ?
    `, [tadaId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'TA/DA entry not found'
      });
    }
    
    const tadaEntry = transformTADA(rows[0] as TADAWithoutRelations, rows[0].employee_name || 'Unknown');
    
    res.json({
      success: true,
      message: 'TA/DA entry updated successfully',
      data: {
        tadaEntry
      }
    });
  } catch (error) {
    console.error('Error updating TA/DA entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update TA/DA entry'
    });
  }
});

// DELETE /api/tada/:id - Delete TA/DA entry
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const tadaId = parseInt(req.params.id);
    
    if (isNaN(tadaId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TA/DA ID'
      });
    }
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      DELETE FROM tada WHERE id = ?
    `, [tadaId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'TA/DA entry not found'
      });
    }
    
    res.json({
      success: true,
      message: 'TA/DA entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting TA/DA entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete TA/DA entry'
    });
  }
});

export default router;
