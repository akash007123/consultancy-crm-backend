// Saved Reports management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  SavedReport,
  SavedReportWithoutRelations,
  CreateReportRequest,
  UpdateReportRequest,
  ReportType,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating report
const createReportSchema = z.object({
  name: z.string().min(1, 'Report name is required'),
  reportType: z.enum(['employee', 'visit', 'attendance', 'expense', 'stock', 'sales', 'invoice']),
  filters: z.record(z.unknown()).optional(),
});

// Validation schema for updating report
const updateReportSchema = z.object({
  id: z.number().int().positive('Valid report ID is required'),
  name: z.string().min(1).optional(),
  reportType: z.enum(['employee', 'visit', 'attendance', 'expense', 'stock', 'sales', 'invoice']).optional(),
  filters: z.record(z.unknown()).optional(),
});

// Helper to transform database row to SavedReport object
function transformReport(row: SavedReportWithoutRelations): SavedReport {
  let filters = null;
  if (row.filters) {
    try {
      filters = JSON.parse(row.filters);
    } catch {
      filters = null;
    }
  }
  
  return {
    id: row.id,
    name: row.name,
    reportType: row.report_type as ReportType,
    filters,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/reports - Get all saved reports
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { reportType, search } = req.query;
    
    let query = 'SELECT * FROM saved_reports WHERE 1=1';
    const params: (string | number)[] = [];
    
    if (reportType && typeof reportType === 'string') {
      query += ' AND report_type = ?';
      params.push(reportType);
    }
    
    if (search && typeof search === 'string') {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);
    
    const reports: SavedReport[] = rows.map(row => transformReport(row as SavedReportWithoutRelations));
    
    res.json({
      success: true,
      data: {
        reports
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reports'
    });
  }
});

// GET /api/reports/:id - Get single report by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const reportId = parseInt(req.params.id);
    
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM saved_reports WHERE id = ?',
      [reportId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }
    
    const report = transformReport(rows[0] as SavedReportWithoutRelations);
    
    res.json({
      success: true,
      data: {
        report
      }
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch report'
    });
  }
});

// POST /api/reports - Create new saved report
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const validationResult = createReportSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { name, reportType, filters } = validationResult.data;
    const userId = req.user?.id || 1;
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO saved_reports (name, report_type, filters, created_by) VALUES (?, ?, ?, ?)`,
      [name, reportType, filters ? JSON.stringify(filters) : null, userId]
    );
    
    // Get the created report
    const [newRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM saved_reports WHERE id = ?',
      [result.insertId]
    );
    
    const report = transformReport(newRows[0] as SavedReportWithoutRelations);
    
    res.status(201).json({
      success: true,
      data: {
        report
      }
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create report'
    });
  }
});

// PUT /api/reports/:id - Update saved report
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const reportId = parseInt(req.params.id);
    
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
    }
    
    const validationResult = updateReportSchema.safeParse({
      id: reportId,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { name, reportType, filters } = validationResult.data;
    
    // Check if report exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM saved_reports WHERE id = ?',
      [reportId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }
    
    // Build update query
    const updates: string[] = [];
    const values: (string | number)[] = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (reportType !== undefined) {
      updates.push('report_type = ?');
      values.push(reportType);
    }
    if (filters !== undefined) {
      updates.push('filters = ?');
      values.push(JSON.stringify(filters));
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      values.push(reportId);
      
      await pool.execute<mysql.ResultSetHeader>(
        `UPDATE saved_reports SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
    
    // Get the updated report
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM saved_reports WHERE id = ?',
      [reportId]
    );
    
    const report = transformReport(rows[0] as SavedReportWithoutRelations);
    
    res.json({
      success: true,
      data: {
        report
      }
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update report'
    });
  }
});

// DELETE /api/reports/:id - Delete saved report
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const reportId = parseInt(req.params.id);
    
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
    }
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'DELETE FROM saved_reports WHERE id = ?',
      [reportId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete report'
    });
  }
});

export default router;
