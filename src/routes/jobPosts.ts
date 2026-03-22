// Job Post management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Job Post type enum
export type JobType = 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
export type JobStatus = 'Active' | 'Closed';

// Job Post row type from database
interface JobPostRow {
  id: number;
  title: string;
  date: string;
  type: JobType;
  location: string;
  experience: string;
  description: string;
  position: number;
  status: JobStatus;
  created_at: Date;
  updated_at: Date;
}

// Validation schema for creating job post
const createJobPostSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'),
  type: z.enum(['Full-time', 'Part-time', 'Contract', 'Internship']),
  location: z.string().min(1, 'Location is required'),
  experience: z.string().min(1, 'Experience is required'),
  description: z.string().min(1, 'Description is required'),
  position: z.number().int().positive('Position must be a positive number'),
  status: z.enum(['Active', 'Closed']).optional().default('Active')
});

// Validation schema for updating job post
const updateJobPostSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  date: z.string().min(1, 'Date is required').optional(),
  type: z.enum(['Full-time', 'Part-time', 'Contract', 'Internship']).optional(),
  location: z.string().min(1, 'Location is required').optional(),
  experience: z.string().min(1, 'Experience is required').optional(),
  description: z.string().min(1, 'Description is required').optional(),
  position: z.number().int().positive('Position must be a positive number').optional(),
  status: z.enum(['Active', 'Closed']).optional()
});

// Transform database row to job post object
function transformJobPost(row: any): any {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    type: row.type,
    location: row.location,
    experience: row.experience,
    description: row.description,
    position: row.position,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/job-posts - Get all job posts
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM job_posts ORDER BY created_at DESC
    `);
    
    const jobPosts = rows.map(row => transformJobPost(row));
    
    res.json({
      success: true,
      data: jobPosts
    });
  } catch (error) {
    console.error('Error fetching job posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job posts'
    });
  }
});

// GET /api/job-posts/active - Get only active job posts (for public listing)
router.get('/active', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM job_posts WHERE status = 'Active' ORDER BY created_at DESC
    `);
    
    const jobPosts = rows.map(row => transformJobPost(row));
    
    res.json({
      success: true,
      data: jobPosts
    });
  } catch (error) {
    console.error('Error fetching active job posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active job posts'
    });
  }
});

// GET /api/job-posts/:id - Get a single job post by ID
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM job_posts WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found'
      });
    }
    
    const jobPost = transformJobPost(rows[0]);
    
    res.json({
      success: true,
      data: jobPost
    });
  } catch (error) {
    console.error('Error fetching job post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job post'
    });
  }
});

// POST /api/job-posts - Create a new job post
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validationResult = createJobPostSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data = validationResult.data;
    const pool = getPool();
    
    const status = data.status || 'Active';
    
    const [result] = await pool.execute(
      `INSERT INTO job_posts (title, date, type, location, experience, description, position, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.date,
        data.type,
        data.location,
        data.experience,
        data.description,
        data.position,
        status
      ]
    );
    
    // Fetch the created job post
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM job_posts WHERE id = ?',
      [(result as mysql.ResultSetHeader).insertId]
    );
    
    const jobPost = transformJobPost(rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Job post created successfully',
      data: jobPost
    });
  } catch (error) {
    console.error('Error creating job post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create job post'
    });
  }
});

// PUT /api/job-posts/:id - Update a job post
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request body
    const validationResult = updateJobPostSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data = validationResult.data;
    const pool = getPool();
    
    // Check if job post exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM job_posts WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found'
      });
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    
    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.date !== undefined) {
      updates.push('date = ?');
      values.push(data.date);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      values.push(data.type);
    }
    if (data.location !== undefined) {
      updates.push('location = ?');
      values.push(data.location);
    }
    if (data.experience !== undefined) {
      updates.push('experience = ?');
      values.push(data.experience);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.position !== undefined) {
      updates.push('position = ?');
      values.push(data.position);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await pool.execute(
        `UPDATE job_posts SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
    
    // Fetch the updated job post
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM job_posts WHERE id = ?',
      [id]
    );
    
    const jobPost = transformJobPost(rows[0]);
    
    res.json({
      success: true,
      message: 'Job post updated successfully',
      data: jobPost
    });
  } catch (error) {
    console.error('Error updating job post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update job post'
    });
  }
});

// DELETE /api/job-posts/:id - Delete a job post
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    // Check if job post exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM job_posts WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found'
      });
    }
    
    await pool.execute('DELETE FROM job_posts WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Job post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting job post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete job post'
    });
  }
});

export default router;
