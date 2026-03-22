// Stock Transaction management routes (Master Distributor Stock)
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  StockTransaction,
  StockTransactionWithoutRelations,
  CreateStockTransactionRequest,
  UpdateStockTransactionRequest,
  StockTransactionType,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating stock transaction
const createStockTransactionSchema = z.object({
  stockItemId: z.number().int().positive('Stock item is required'),
  type: z.enum(['IN', 'OUT']),
  quantity: z.number().int().positive('Quantity must be a positive number'),
  date: z.string().min(1, 'Date is required'),
  sourceDest: z.string().min(1, 'Source/Destination is required'),
  remarks: z.string().optional().default('')
});

// Validation schema for updating stock transaction
const updateStockTransactionSchema = z.object({
  id: z.number().int().positive('Valid transaction ID is required'),
  stockItemId: z.number().int().positive().optional(),
  type: z.enum(['IN', 'OUT']).optional(),
  quantity: z.number().int().positive().optional(),
  date: z.string().optional(),
  sourceDest: z.string().optional(),
  description: z.string().optional().default('')
});

// Helper function to transform database row to StockTransaction object
function transformStockTransaction(row: StockTransactionWithoutRelations, stockName: string): StockTransaction {
  return {
    id: row.id,
    stockItemId: row.stock_item_id,
    stockItemName: stockName,
    type: row.type,
    quantity: row.quantity,
    date: row.date,
    sourceDest: row.source_dest,
    remarks: row.remarks,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/stock-transactions - Get all stock transactions
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { type, stockItemId } = req.query;
    
    let query = `
      SELECT st.*, s.name as stock_name 
      FROM stock_transactions st
      LEFT JOIN stock s ON st.stock_item_id = s.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (type && typeof type === 'string') {
      query += ' AND st.type = ?';
      params.push(type);
    }

    if (stockItemId && typeof stockItemId === 'string') {
      query += ' AND st.stock_item_id = ?';
      params.push(parseInt(stockItemId));
    }

    query += ' ORDER BY st.id DESC';

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);
    
    const transactions: StockTransaction[] = rows.map(row => 
      transformStockTransaction(row as StockTransactionWithoutRelations, row.stock_name || 'Unknown')
    );
    
    res.json({
      success: true,
      data: {
        transactions
      }
    });
  } catch (error) {
    console.error('Error fetching stock transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stock transactions'
    });
  }
});

// GET /api/stock-transactions/:id - Get single stock transaction by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const transactionId = parseInt(req.params.id);
    
    if (isNaN(transactionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT st.*, s.name as stock_name 
       FROM stock_transactions st
       LEFT JOIN stock s ON st.stock_item_id = s.id
       WHERE st.id = ?`,
      [transactionId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock transaction not found'
      });
    }
    
    const transaction = transformStockTransaction(
      rows[0] as StockTransactionWithoutRelations, 
      rows[0].stock_name || 'Unknown'
    );
    
    res.json({
      success: true,
      data: {
        transaction
      }
    });
  } catch (error) {
    console.error('Error fetching stock transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stock transaction'
    });
  }
});

// POST /api/stock-transactions - Create new stock transaction
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = createStockTransactionSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { stockItemId, type, quantity, date, sourceDest, remarks }: CreateStockTransactionRequest = validationResult.data;
    const pool = getPool();
    
    // Check if stock item exists
    const [stockRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, quantity FROM stock WHERE id = ?',
      [stockItemId]
    );
    
    if (stockRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Stock item not found'
      });
    }
    
    // For OUT transactions, check if sufficient stock is available
    if (type === 'OUT') {
      const currentStock = stockRows[0].quantity;
      if (currentStock < quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock. Available: ${currentStock}`
        });
      }
    }
    
    // Insert the transaction
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO stock_transactions (stock_item_id, type, quantity, date, source_dest, remarks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [stockItemId, type, quantity, date, sourceDest, remarks || null]
    );
    
    // Update the stock quantity
    let stockUpdateQuery = '';
    let stockParams: (string | number)[];
    
    if (type === 'IN') {
      stockUpdateQuery = 'UPDATE stock SET quantity = quantity + ? WHERE id = ?';
      stockParams = [quantity, stockItemId];
    } else {
      stockUpdateQuery = 'UPDATE stock SET quantity = quantity - ? WHERE id = ?';
      stockParams = [quantity, stockItemId];
    }
    
    await pool.execute(stockUpdateQuery, stockParams);
    
    // Get the created transaction
    const [newRows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT st.*, s.name as stock_name 
       FROM stock_transactions st
       LEFT JOIN stock s ON st.stock_item_id = s.id
       WHERE st.id = ?`,
      [result.insertId]
    );
    
    if (newRows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve created transaction'
      });
    }
    
    const transaction = transformStockTransaction(
      newRows[0] as StockTransactionWithoutRelations,
      newRows[0].stock_name || 'Unknown'
    );
    
    res.status(201).json({
      success: true,
      message: 'Stock transaction created successfully',
      data: {
        transaction
      }
    });
  } catch (error) {
    console.error('Error creating stock transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create stock transaction'
    });
  }
});

// PUT /api/stock-transactions/:id - Update stock transaction
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const transactionId = parseInt(req.params.id);
    
    if (isNaN(transactionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID'
      });
    }
    
    const validationResult = updateStockTransactionSchema.safeParse({
      id: transactionId,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { stockItemId, type, quantity, date, sourceDest, remarks }: UpdateStockTransactionRequest = validationResult.data;
    const pool = getPool();
    
    // Check if transaction exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM stock_transactions WHERE id = ?',
      [transactionId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock transaction not found'
      });
    }
    
    const existingTransaction = existingRows[0];
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    
    if (stockItemId !== undefined) {
      updates.push('stock_item_id = ?');
      values.push(stockItemId);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      values.push(type);
    }
    if (quantity !== undefined) {
      updates.push('quantity = ?');
      values.push(quantity);
    }
    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (sourceDest !== undefined) {
      updates.push('source_dest = ?');
      values.push(sourceDest);
    }
    if (remarks !== undefined) {
      updates.push('remarks = ?');
      values.push(remarks || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push('updated_at = NOW()');
    values.push(transactionId);
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE stock_transactions SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock transaction not found'
      });
    }
    
    // Get the updated transaction
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT st.*, s.name as stock_name 
       FROM stock_transactions st
       LEFT JOIN stock s ON st.stock_item_id = s.id
       WHERE st.id = ?`,
      [transactionId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock transaction not found'
      });
    }
    
    const transaction = transformStockTransaction(
      rows[0] as StockTransactionWithoutRelations,
      rows[0].stock_name || 'Unknown'
    );
    
    res.json({
      success: true,
      message: 'Stock transaction updated successfully',
      data: {
        transaction
      }
    });
  } catch (error) {
    console.error('Error updating stock transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update stock transaction'
    });
  }
});

// DELETE /api/stock-transactions/:id - Delete stock transaction
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const transactionId = parseInt(req.params.id);
    
    if (isNaN(transactionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID'
      });
    }
    
    // Check if transaction exists and get its details
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM stock_transactions WHERE id = ?',
      [transactionId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock transaction not found'
      });
    }
    
    const existingTransaction = existingRows[0];
    
    // Reverse the stock quantity change
    if (existingTransaction.type === 'IN') {
      await pool.execute(
        'UPDATE stock SET quantity = quantity - ? WHERE id = ?',
        [existingTransaction.quantity, existingTransaction.stock_item_id]
      );
    } else {
      await pool.execute(
        'UPDATE stock SET quantity = quantity + ? WHERE id = ?',
        [existingTransaction.quantity, existingTransaction.stock_item_id]
      );
    }
    
    // Delete the transaction
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'DELETE FROM stock_transactions WHERE id = ?',
      [transactionId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock transaction not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Stock transaction deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting stock transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete stock transaction'
    });
  }
});

export default router;
