// Expense management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  Expense,
  ExpenseWithoutRelations,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating expense
const createExpenseSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().optional().default('')
});

// Validation schema for updating expense
const updateExpenseSchema = z.object({
  id: z.number().int().positive('Valid expense ID is required'),
  category: z.string().min(1, 'Category is required').optional(),
  amount: z.number().positive('Amount must be a positive number').optional(),
  description: z.string().optional().default('')
});

// Helper function to transform database row to Expense object
function transformExpense(row: ExpenseWithoutRelations): Expense {
  return {
    id: row.id,
    category: row.category,
    amount: row.amount,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/expenses - Get all expenses
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM expenses ORDER BY created_at DESC
    `);
    
    const expenses: Expense[] = rows.map(row => transformExpense(row as ExpenseWithoutRelations));
    
    res.json({
      success: true,
      data: {
        expenses
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expenses'
    });
  }
});

// GET /api/expenses/:id - Get single expense by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const expenseId = parseInt(req.params.id);
    
    if (isNaN(expenseId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid expense ID'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM expenses WHERE id = ?
    `, [expenseId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
    }
    
    const expense = transformExpense(rows[0] as ExpenseWithoutRelations);
    
    res.json({
      success: true,
      data: {
        expense
      }
    });
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expense'
    });
  }
});

// POST /api/expenses - Create new expense
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = createExpenseSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { category, amount, description }: CreateExpenseRequest = validationResult.data;
    const pool = getPool();
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      INSERT INTO expenses (category, amount, description, created_at, updated_at)
      VALUES (?, ?, ?, NOW(), NOW())
    `, [category, amount, description || null]);
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM expenses WHERE id = ?
    `, [result.insertId]);
    
    if (rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve created expense'
      });
    }
    
    const expense = transformExpense(rows[0] as ExpenseWithoutRelations);
    
    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: {
        expense
      }
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create expense'
    });
  }
});

// PUT /api/expenses/:id - Update expense
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const expenseId = parseInt(req.params.id);
    
    if (isNaN(expenseId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid expense ID'
      });
    }
    
    const validationResult = updateExpenseSchema.safeParse({
      id: expenseId,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { category, amount, description }: UpdateExpenseRequest = validationResult.data;
    const pool = getPool();
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (amount !== undefined) {
      updates.push('amount = ?');
      values.push(amount);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push('updated_at = NOW()');
    values.push(expenseId);
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      UPDATE expenses SET ${updates.join(', ')} WHERE id = ?
    `, values);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM expenses WHERE id = ?
    `, [expenseId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
    }
    
    const expense = transformExpense(rows[0] as ExpenseWithoutRelations);
    
    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: {
        expense
      }
    });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update expense'
    });
  }
});

// DELETE /api/expenses/:id - Delete expense
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const expenseId = parseInt(req.params.id);
    
    if (isNaN(expenseId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid expense ID'
      });
    }
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(`
      DELETE FROM expenses WHERE id = ?
    `, [expenseId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete expense'
    });
  }
});

export default router;
