// Candidate management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Candidate status enum
export type CandidateStatus = 'Shortlisted' | 'Pending' | 'Interview Scheduled' | 'Applied' | 'Offer Sent' | 'Accepted Offer';

// Candidate row type from database
interface CandidateRow {
  id: number;
  name: string;
  position: string;
  status: CandidateStatus;
  email: string | null;
  phone: string | null;
  resume_url: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// Validation schema for creating candidate
const createCandidateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  position: z.string().min(1, 'Position is required'),
  status: z.enum(['Shortlisted', 'Pending', 'Interview Scheduled', 'Applied', 'Offer Sent', 'Accepted Offer']).optional().default('Pending'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal(''))
});

// Validation schema for updating candidate
const updateCandidateSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  position: z.string().min(1, 'Position is required').optional(),
  status: z.enum(['Shortlisted', 'Pending', 'Interview Scheduled', 'Applied', 'Offer Sent', 'Accepted Offer']).optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal(''))
});

// Transform database row to candidate object
function transformCandidate(row: any): any {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    status: row.status,
    email: row.email || '',
    phone: row.phone || '',
    resumeUrl: row.resume_url || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/candidates - Get all candidates
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM candidates ORDER BY created_at DESC
    `);
    
    const candidates = rows.map(row => transformCandidate(row));
    
    res.json({
      success: true,
      data: candidates
    });
  } catch (error) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch candidates'
    });
  }
});

// GET /api/candidates/:id - Get a single candidate by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM candidates WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found'
      });
    }
    
    const candidate = transformCandidate(rows[0]);
    
    res.json({
      success: true,
      data: candidate
    });
  } catch (error) {
    console.error('Error fetching candidate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch candidate'
    });
  }
});

// POST /api/candidates - Create a new candidate
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validationResult = createCandidateSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data = validationResult.data;
    const pool = getPool();
    
    const status = data.status || 'Pending';
    
    const [result] = await pool.execute(
      `INSERT INTO candidates (name, position, status, email, phone, notes) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.position,
        status,
        data.email || null,
        data.phone || null,
        data.notes || null
      ]
    );
    
    // Fetch the created candidate
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM candidates WHERE id = ?',
      [(result as mysql.ResultSetHeader).insertId]
    );
    
    const candidate = transformCandidate(rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Candidate created successfully',
      data: candidate
    });
  } catch (error) {
    console.error('Error creating candidate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create candidate'
    });
  }
});

// PUT /api/candidates/:id - Update a candidate
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request body
    const validationResult = updateCandidateSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data = validationResult.data;
    const pool = getPool();
    
    // Check if candidate exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM candidates WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found'
      });
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    
    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.position !== undefined) {
      updates.push('position = ?');
      values.push(data.position);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email || null);
    }
    if (data.phone !== undefined) {
      updates.push('phone = ?');
      values.push(data.phone || null);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      values.push(data.notes || null);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await pool.execute(
        `UPDATE candidates SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
    
    // Fetch the updated candidate
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM candidates WHERE id = ?',
      [id]
    );
    
    const candidate = transformCandidate(rows[0]);
    
    res.json({
      success: true,
      message: 'Candidate updated successfully',
      data: candidate
    });
  } catch (error) {
    console.error('Error updating candidate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update candidate'
    });
  }
});

// DELETE /api/candidates/:id - Delete a candidate
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    // Check if candidate exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM candidates WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Candidate not found'
      });
    }
    
    await pool.execute('DELETE FROM candidates WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Candidate deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting candidate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete candidate'
    });
  }
});

export default router;
