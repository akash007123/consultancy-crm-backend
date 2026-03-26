// Product management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  Product,
  ProductWithoutRelations,
  CreateProductRequest,
  UpdateProductRequest,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating product
const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  price: z.number().positive('Price must be positive'),
  stock: z.number().int().min(0, 'Stock must be a non-negative number'),
  unit: z.string().min(1, 'Unit is required'),
  description: z.string().optional().default(''),
  minQuantity: z.number().int().min(0).optional().default(10),
});

// Validation schema for updating product
const updateProductSchema = z.object({
  id: z.number().int().positive('Valid product ID is required'),
  name: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  stock: z.number().int().min(0).optional(),
  unit: z.string().min(1).optional(),
  description: z.string().optional(),
  minQuantity: z.number().int().min(0).optional(),
});

// Helper function to determine stock status
function determineStatus(stock: number, minQuantity: number): 'In Stock' | 'Low Stock' | 'Out of Stock' {
  if (stock === 0) return 'Out of Stock';
  if (stock <= minQuantity) return 'Low Stock';
  return 'In Stock';
}

// Helper function to transform database row to Product object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformProduct(row: any): Product {
  const minQuantity = row.min_quantity || 10;
  return {
    id: row.id,
    name: row.name,
    price: parseFloat(row.price),
    stock: row.stock,
    unit: row.unit,
    description: row.description || undefined,
    minQuantity: minQuantity,
    status: determineStatus(row.stock, minQuantity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/products - Get all products
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { search, status, isActive } = req.query;
    
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: (string | number)[] = [];

    // Search by name
    if (search && typeof search === 'string') {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    // Filter by active status
    if (isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(isActive === 'true' ? 1 : 0);
    }

    // Handle status filtering based on computed status
    if (status && typeof status === 'string' && status !== 'all') {
      if (status === 'In Stock') {
        query += ' AND stock > min_quantity';
      } else if (status === 'Low Stock') {
        query += ' AND stock <= min_quantity AND stock > 0';
      } else if (status === 'Out of Stock') {
        query += ' AND stock = 0';
      }
    }

    query += ' ORDER BY name ASC';

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);

    const products: Product[] = rows.map(row => transformProduct(row));

    res.json({
      success: true,
      data: { products }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/products/:id - Get product by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

    const product = transformProduct(rows[0]);

    res.json({
      success: true,
      data: { product }
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/products - Create new product
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate input
    const validationResult = createProductSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        error: validationResult.error.errors[0].message
      });
      return;
    }

    const { name, price, stock, unit, description, minQuantity } = validationResult.data;
    const pool = getPool();

    // Check if product with same name exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM products WHERE name = ?',
      [name]
    );

    if (existingRows.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Product with this name already exists'
      });
      return;
    }

    // Insert product
    const [result] = await pool.execute(
      `INSERT INTO products (name, price, stock, unit, description, min_quantity) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, price, stock, unit, description || '', minQuantity || 10]
    );

    const productId = (result as mysql.ResultSetHeader).insertId;

    // Fetch created product
    const [newProductRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    );

    const product = transformProduct(newProductRows[0]);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product }
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate input
    const validationResult = updateProductSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        error: validationResult.error.errors[0].message
      });
      return;
    }

    const { id } = req.params;
    const { name, price, stock, unit, description, minQuantity } = validationResult.data;
    const pool = getPool();

    // Check if product exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

    // Check if name is being changed and if it conflicts
    if (name && name !== existingRows[0].name) {
      const [duplicateRows] = await pool.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM products WHERE name = ? AND id != ?',
        [name, id]
      );
      if (duplicateRows.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Product with this name already exists'
        });
        return;
      }
    }

    // Build update query
    const updateFields: string[] = [];
    const updateValues: (string | number)[] = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (price !== undefined) {
      updateFields.push('price = ?');
      updateValues.push(price);
    }
    if (stock !== undefined) {
      updateFields.push('stock = ?');
      updateValues.push(stock);
    }
    if (unit !== undefined) {
      updateFields.push('unit = ?');
      updateValues.push(unit);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (minQuantity !== undefined) {
      updateFields.push('min_quantity = ?');
      updateValues.push(minQuantity);
    }

    if (updateFields.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
      return;
    }

    updateValues.push(parseInt(id));

    await pool.execute(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Fetch updated product
    const [updatedRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    const product = transformProduct(updatedRows[0]);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: { product }
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/products/:id - Delete (deactivate) product
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    // Check if product exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

    // Check if product is used in any orders
    const [orderItemsRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM order_items WHERE product_id = ? LIMIT 1',
      [id]
    );

    if (orderItemsRows.length > 0) {
      // Instead of deleting, just deactivate
      await pool.execute(
        'UPDATE products SET is_active = FALSE WHERE id = ?',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Product deactivated (cannot delete as it is used in orders)'
      });
      return;
    }

    // Delete product if not used in orders
    await pool.execute('DELETE FROM products WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PATCH /api/products/:id/toggle - Toggle product active status
router.patch('/:id/toggle', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    // Check if product exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT is_active FROM products WHERE id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Product not found'
      });
      return;
    }

    const newStatus = !existingRows[0].is_active;
    
    await pool.execute(
      'UPDATE products SET is_active = ? WHERE id = ?',
      [newStatus, id]
    );

    // Fetch updated product
    const [updatedRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    const product = transformProduct(updatedRows[0]);

    res.json({
      success: true,
      message: `Product ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: { product }
    });
  } catch (error) {
    console.error('Error toggling product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle product status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
