// Job Application management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';

const router = Router();

// Job Application row type from database
interface JobApplicationRow {
  id: number;
  job_id: number;
  job_title: string;
  name: string;
  email: string;
  mobile: string;
  education: string;
  address: string;
  resume_url: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

// Validation schema for creating job application
const createJobApplicationSchema = z.object({
  jobId: z.number().int().positive('Job ID is required'),
  jobTitle: z.string().min(1, 'Job title is required'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().min(10, 'Mobile number must be at least 10 digits'),
  education: z.string().min(1, 'Education is required'),
  address: z.string().min(1, 'Address is required')
});

// Transform database row to job application object
function transformJobApplication(row: any): any {
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    name: row.name,
    email: row.email || '',
    mobile: row.mobile || '',
    education: row.education || '',
    address: row.address || '',
    resumeUrl: row.resume_url || '',
    status: row.status || 'Applied',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// POST /api/job-applications - Create a new job application (public endpoint)
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validationResult = createJobApplicationSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data = validationResult.data;
    const pool = getPool();
    
    const [result] = await pool.execute(
      `INSERT INTO job_applications (job_id, job_title, name, email, mobile, education, address) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.jobId,
        data.jobTitle,
        data.name,
        data.email,
        data.mobile,
        data.education,
        data.address
      ]
    );
    
    // Fetch the created job application
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM job_applications WHERE id = ?',
      [(result as mysql.ResultSetHeader).insertId]
    );
    
    const jobApplication = transformJobApplication(rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: jobApplication
    });
  } catch (error) {
    console.error('Error creating job application:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit application'
    });
  }
});

// GET /api/job-applications - Get all job applications (requires authentication)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM job_applications ORDER BY created_at DESC
    `);
    
    const jobApplications = rows.map(row => transformJobApplication(row));
    
    res.json({
      success: true,
      data: jobApplications
    });
  } catch (error) {
    console.error('Error fetching job applications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job applications'
    });
  }
});

// GET /api/job-applications/:id - Get a single job application by ID
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM job_applications WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job application not found'
      });
    }
    
    const jobApplication = transformJobApplication(rows[0]);
    
    res.json({
      success: true,
      data: jobApplication
    });
  } catch (error) {
    console.error('Error fetching job application:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job application'
    });
  }
});

// PUT /api/job-applications/:id - Update job application status
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const pool = getPool();
    
    // Check if job application exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM job_applications WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job application not found'
      });
    }
    
    // Update status
    if (status) {
      await pool.execute(
        'UPDATE job_applications SET status = ? WHERE id = ?',
        [status, id]
      );
    }
    
    // Fetch the updated job application
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM job_applications WHERE id = ?',
      [id]
    );
    
    const jobApplication = transformJobApplication(rows[0]);
    
    res.json({
      success: true,
      message: 'Job application updated successfully',
      data: jobApplication
    });
  } catch (error) {
    console.error('Error updating job application:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update job application'
    });
  }
});

// DELETE /api/job-applications/:id - Delete a job application
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    // Check if job application exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM job_applications WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job application not found'
      });
    }
    
    await pool.execute('DELETE FROM job_applications WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Job application deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting job application:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete job application'
    });
  }
});

// Add type for authenticated request
interface AuthenticatedRequest {
  params: any;
  body: any;
}

export default router;
