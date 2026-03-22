// Stock management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  Stock,
  StockWithoutRelations,
  CreateStockRequest,
  UpdateStockRequest,
  StockStatus,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating stock
const createStockSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  quantity: z.number().int().min(0, 'Quantity must be a non-negative number'),
  unit: z.string().min(1, 'Unit is required'),
  description: z.string().optional().default(''),
  minQuantity: z.number().int().min(0).optional().default(10)
});

// Validation schema for updating stock
const updateStockSchema = z.object({
  id: z.number().int().positive('Valid stock ID is required'),
  name: z.string().min(1, 'Name is required').optional(),
  quantity: z.number().int().min(0, 'Quantity must be a non-negative number').optional(),
  unit: z.string().min(1, 'Unit is required').optional(),
  description: z.string().optional().default(''),
  minQuantity: z.number().int().min(0).optional()
});

// Helper function to determine stock status based on quantity and minQuantity
function determineStatus(quantity: number, minQuantity: number): StockStatus {
  if (quantity === 0) return 'Out of Stock';
  if (quantity <= minQuantity) return 'Low Stock';
  return 'In Stock';
}

// Helper function to transform database row to Stock object
function transformStock(row: StockWithoutRelations): Stock {
  const minQuantity = row.min_quantity || 10;
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    status: determineStatus(row.quantity, minQuantity),
    description: row.description,
    minQuantity: minQuantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/stock - Get all stock items
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { search, status } = req.query;
    
    let query = 'SELECT * FROM stock WHERE 1=1';
    const params: (string | number)[] = [];

    if (search && typeof search === 'string') {
      query += ' AND (name LIKE ?)';
      params.push(`%${search}%`);
    }

    if (status && typeof status === 'string') {
      // Handle status filtering based on computed status
      if (status === 'In Stock') {
        query += ' AND quantity > min_quantity';
      } else if (status === 'Low Stock') {
        query += ' AND quantity <= min_quantity AND quantity > 0';
      } else if (status === 'Out of Stock') {
        query += ' AND quantity = 0';
      }
    }

    query += ' ORDER BY id DESC';

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);
    
    const stock: Stock[] = rows.map(row => transformStock(row as StockWithoutRelations));
    
    res.json({
      success: true,
      data: {
        stock
      }
    });
  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stock items'
    });
  }
});

// GET /api/stock/:id - Get single stock item by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const stockId = parseInt(req.params.id);
    
    if (isNaN(stockId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock ID'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM stock WHERE id = ?',
      [stockId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock item not found'
      });
    }
    
    const stock = transformStock(rows[0] as StockWithoutRelations);
    
    res.json({
      success: true,
      data: {
        stock
      }
    });
  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stock item'
    });
  }
});

// POST /api/stock - Create new stock item
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = createStockSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { name, quantity, unit, description, minQuantity }: CreateStockRequest = validationResult.data;
    const pool = getPool();
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO stock (name, quantity, unit, description, min_quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [name, quantity, unit, description || null, minQuantity || 10]
    );
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM stock WHERE id = ?',
      [result.insertId]
    );
    
    if (rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve created stock item'
      });
    }
    
    const stock = transformStock(rows[0] as StockWithoutRelations);
    
    res.status(201).json({
      success: true,
      message: 'Stock item created successfully',
      data: {
        stock
      }
    });
  } catch (error) {
    console.error('Error creating stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create stock item'
    });
  }
});

// PUT /api/stock/:id - Update stock item
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stockId = parseInt(req.params.id);
    
    if (isNaN(stockId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock ID'
      });
    }
    
    const validationResult = updateStockSchema.safeParse({
      id: stockId,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { name, quantity, unit, description, minQuantity }: UpdateStockRequest = validationResult.data;
    const pool = getPool();
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (quantity !== undefined) {
      updates.push('quantity = ?');
      values.push(quantity);
    }
    if (unit !== undefined) {
      updates.push('unit = ?');
      values.push(unit);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description || null);
    }
    if (minQuantity !== undefined) {
      updates.push('min_quantity = ?');
      values.push(minQuantity);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push('updated_at = NOW()');
    values.push(stockId);
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE stock SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock item not found'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM stock WHERE id = ?',
      [stockId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock item not found'
      });
    }
    
    const stock = transformStock(rows[0] as StockWithoutRelations);
    
    res.json({
      success: true,
      message: 'Stock item updated successfully',
      data: {
        stock
      }
    });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update stock item'
    });
  }
});

// DELETE /api/stock/:id - Delete stock item
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const stockId = parseInt(req.params.id);
    
    if (isNaN(stockId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock ID'
      });
    }
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'DELETE FROM stock WHERE id = ?',
      [stockId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock item not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Stock item deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting stock:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete stock item'
    });
  }
});

export default router;
