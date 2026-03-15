// Task management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  Task,
  TaskWithoutRelations,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskPriority,
  TaskStatus,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating task
const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  priority: z.enum(['high', 'medium', 'low']),
  assigneeId: z.number().int().positive('Assignee is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  status: z.enum(['in-progress', 'pending', 'completed']).optional().default('pending')
});

// Validation schema for updating task
const updateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional().default(''),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  assigneeId: z.number().int().positive('Assignee is required').optional(),
  dueDate: z.string().min(1, 'Due date is required').optional(),
  status: z.enum(['in-progress', 'pending', 'completed']).optional()
});

// Helper function to transform database row to Task object
function transformTask(row: TaskWithoutRelations, employeeName: string): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    assigneeId: row.assignee_id,
    assigneeName: employeeName,
    assignDate: row.assign_date,
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/tasks - Get all tasks
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        t.*,
        CONCAT(e.first_name, ' ', e.last_name) as assignee_name
      FROM tasks t
      LEFT JOIN employees e ON t.assignee_id = e.id
      ORDER BY t.created_at DESC
    `);
    
    const tasks: Task[] = rows.map(row => transformTask(row as TaskWithoutRelations, row.assignee_name || 'Unknown'));
    
    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks'
    });
  }
});

// GET /api/tasks/:id - Get a single task by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        t.*,
        CONCAT(e.first_name, ' ', e.last_name) as assignee_name
      FROM tasks t
      LEFT JOIN employees e ON t.assignee_id = e.id
      WHERE t.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    const task = transformTask(rows[0] as TaskWithoutRelations, rows[0].assignee_name || 'Unknown');
    
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task'
    });
  }
});

// POST /api/tasks - Create a new task
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validationResult = createTaskSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data: CreateTaskRequest = validationResult.data;
    const pool = getPool();
    
    // Verify assignee exists (check both active and inactive for now)
    const [employeeRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM employees WHERE id = ?',
      [data.assigneeId]
    );
    
    if (employeeRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Assignee not found. Please select a valid employee from the dropdown.'
      });
    }
    
    // Set assign date to current date
    const assignDate = new Date().toISOString().split('T')[0];
    const status = data.status || 'pending';
    
    const [result] = await pool.execute(
      `INSERT INTO tasks (title, description, priority, assignee_id, assign_date, due_date, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.description || null,
        data.priority,
        data.assigneeId,
        assignDate,
        data.dueDate,
        status
      ]
    );
    
    // Fetch the created task
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        t.*,
        CONCAT(e.first_name, ' ', e.last_name) as assignee_name
      FROM tasks t
      LEFT JOIN employees e ON t.assignee_id = e.id
      WHERE t.id = ?
    `, [(result as mysql.ResultSetHeader).insertId]);
    
    const task = transformTask(rows[0] as TaskWithoutRelations, rows[0].assignee_name || 'Unknown');
    
    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task'
    });
  }
});

// PUT /api/tasks/:id - Update a task
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request body
    const validationResult = updateTaskSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data: UpdateTaskRequest = validationResult.data;
    const pool = getPool();
    
    // Check if task exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM tasks WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    // If assigneeId is being updated, verify it exists
    if (data.assigneeId) {
      const [employeeRows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM employees WHERE id = ?',
        [data.assigneeId]
      );
      
      if (employeeRows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Assignee not found'
        });
      }
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    
    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.priority !== undefined) {
      updates.push('priority = ?');
      values.push(data.priority);
    }
    if (data.assigneeId !== undefined) {
      updates.push('assignee_id = ?');
      values.push(data.assigneeId);
    }
    if (data.dueDate !== undefined) {
      updates.push('due_date = ?');
      values.push(data.dueDate);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    
    if (updates.length > 0) {
      values.push(id);
      await pool.execute(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
    
    // Fetch the updated task
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        t.*,
        CONCAT(e.first_name, ' ', e.last_name) as assignee_name
      FROM tasks t
      LEFT JOIN employees e ON t.assignee_id = e.id
      WHERE t.id = ?
    `, [id]);
    
    const task = transformTask(rows[0] as TaskWithoutRelations, rows[0].assignee_name || 'Unknown');
    
    res.json({
      success: true,
      message: 'Task updated successfully',
      data: task
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task'
    });
  }
});

// DELETE /api/tasks/:id - Delete a task
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    // Check if task exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM tasks WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    await pool.execute('DELETE FROM tasks WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete task'
    });
  }
});

export default router;