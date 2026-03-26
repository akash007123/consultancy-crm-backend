// Order management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  Order,
  OrderWithoutRelations,
  OrderProduct,
  OrderStatusHistory,
  CreateOrderRequest,
  UpdateOrderRequest,
  UpdateOrderStatusRequest,
  OrderStatus,
  Product,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating order
const createOrderSchema = z.object({
  customerId: z.number().int().positive('Customer is required'),
  products: z.array(z.object({
    productId: z.number().int().positive('Product is required'),
    quantity: z.number().int().positive('Quantity must be positive'),
    price: z.number().positive('Price must be positive'),
  })).min(1, 'At least one product is required'),
  notes: z.string().optional().default(''),
});

// Validation schema for updating order
const updateOrderSchema = z.object({
  id: z.number().int().positive('Valid order ID is required'),
  customerId: z.number().int().positive().optional(),
  products: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
    price: z.number().positive(),
  })).optional(),
  notes: z.string().optional(),
});

// Validation schema for updating order status
const updateStatusSchema = z.object({
  status: z.enum(['Pending', 'Approved', 'Dispatched', 'Delivered', 'Cancelled'], {
    errorMap: () => ({ message: 'Invalid status value' }),
  }),
});

// Valid status transitions
const validStatusTransitions: Record<OrderStatus, OrderStatus[]> = {
  'Pending': ['Approved', 'Cancelled'],
  'Approved': ['Dispatched', 'Cancelled'],
  'Dispatched': ['Delivered', 'Cancelled'],
  'Delivered': [],
  'Cancelled': [],
};

// Helper to generate order number
async function generateOrderNumber(pool: mysql.Pool | mysql.PoolConnection): Promise<string> {
  const year = new Date().getFullYear();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) as count FROM orders WHERE order_number LIKE ?",
    [`ORD-${year}%`]
  );
  const count = (rows[0]?.count || 0) + 1;
  return `ORD-${year}-${String(count).padStart(4, '0')}`;
}

// Helper function to transform database row to Order object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function transformOrder(row: any, pool: mysql.Pool | mysql.PoolConnection): Promise<Order> {
  // Get customer info
  const [clientRows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT client_name, company_name FROM clients WHERE id = ?',
    [row.customer_id]
  );

  // Get order products
  const [itemRows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
    [row.id]
  );

  const products: OrderProduct[] = itemRows.map(item => ({
    id: item.id,
    productId: item.product_id,
    productName: item.product_name,
    quantity: item.quantity,
    price: parseFloat(item.price),
    subtotal: parseFloat(item.subtotal),
  }));

  // Get status history
  const [historyRows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT osh.*, u.name as changed_by_name FROM order_status_history osh JOIN users u ON osh.changed_by = u.id WHERE osh.order_id = ? ORDER BY osh.changed_at ASC',
    [row.id]
  );

  const statusHistory: OrderStatusHistory[] = historyRows.map(h => ({
    status: h.status as OrderStatus,
    changedAt: h.changed_at,
    changedBy: h.changed_by,
    changedByName: h.changed_by_name,
  }));

  // Get creator info
  const [creatorRows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT name FROM users WHERE id = ?',
    [row.created_by]
  );

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerName: clientRows[0]?.client_name || 'Unknown',
    customerCompany: clientRows[0]?.company_name,
    products,
    totalAmount: parseFloat(row.total_amount),
    status: row.status,
    createdBy: row.created_by,
    createdByName: creatorRows[0]?.name || 'Unknown',
    updatedBy: row.updated_by || undefined,
    statusHistory,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/orders - Get all orders
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { status, search, startDate, endDate, customerId } = req.query;

    let query = 'SELECT * FROM orders WHERE 1=1';
    const params: (string | number)[] = [];

    // Filter by status
    if (status && typeof status === 'string' && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    // Filter by customer
    if (customerId && typeof customerId === 'string') {
      query += ' AND customer_id = ?';
      params.push(parseInt(customerId));
    }

    // Filter by date range
    if (startDate && typeof startDate === 'string') {
      query += ' AND DATE(created_at) >= ?';
      params.push(startDate);
    }
    if (endDate && typeof endDate === 'string') {
      query += ' AND DATE(created_at) <= ?';
      params.push(endDate);
    }

    // Search by order number
    if (search && typeof search === 'string') {
      query += ' AND order_number LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);

    // Transform orders
    const orders = await Promise.all(
      rows.map(row => transformOrder(row, pool))
    );

    res.json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/orders/:id - Get order by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }

    const order = await transformOrder(rows[0], pool);

    res.json({
      success: true,
      data: { order }
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/orders - Create new order
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const connection = await getPool().getConnection();
  
  try {
    // Validate input
    const validationResult = createOrderSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        error: validationResult.error.errors[0].message
      });
      return;
    }

    const { customerId, products, notes } = validationResult.data;
    const userId = req.user!.id;

    // Start transaction
    await connection.beginTransaction();

    // Check if customer exists
    const [customerRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM clients WHERE id = ?',
      [customerId]
    );
    if (customerRows.length === 0) {
      throw new Error('Customer not found');
    }

    // Validate products and check stock
    for (const item of products) {
      const [productRows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id, stock, name FROM products WHERE id = ? AND is_active = TRUE',
        [item.productId]
      );
      
      if (productRows.length === 0) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      
      if (productRows[0].stock < item.quantity) {
        throw new Error(`Insufficient stock for product "${productRows[0].name}". Available: ${productRows[0].stock}, Requested: ${item.quantity}`);
      }
    }

    // Generate order number
    const orderNumber = await generateOrderNumber(connection);

    // Calculate total amount
    let totalAmount = 0;
    for (const item of products) {
      totalAmount += item.price * item.quantity;
    }

    // Insert order
    const [orderResult] = await connection.execute(
      `INSERT INTO orders (order_number, customer_id, total_amount, status, notes, created_by) 
       VALUES (?, ?, ?, 'Pending', ?, ?)`,
      [orderNumber, customerId, totalAmount, notes || '', userId]
    );

    const orderId = (orderResult as mysql.ResultSetHeader).insertId;

    // Insert order items and reduce stock
    for (const item of products) {
      const subtotal = item.price * item.quantity;
      
      await connection.execute(
        `INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) 
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.productId, item.quantity, item.price, subtotal]
      );

      // Reduce stock
      await connection.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.productId]
      );
    }

    // Insert initial status history
    await connection.execute(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, 'Pending', ?)`,
      [orderId, userId]
    );

    // Commit transaction
    await connection.commit();

    // Fetch the created order
    const [newOrderRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    );

    const order = await transformOrder(newOrderRows[0], connection);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating order:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create order',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    connection.release();
  }
});

// PUT /api/orders/:id - Update order (only if Pending)
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const connection = await getPool().getConnection();
  
  try {
    // Validate input
    const validationResult = updateOrderSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        error: validationResult.error.errors[0].message
      });
      return;
    }

    const { id } = req.params;
    const { customerId, products, notes } = validationResult.data;
    const userId = req.user!.id;

    // Start transaction
    await connection.beginTransaction();

    // Check if order exists and is Pending
    const [orderRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    if (orderRows.length === 0) {
      throw new Error('Order not found');
    }

    const currentOrder = orderRows[0];
    if (currentOrder.status !== 'Pending') {
      throw new Error('Only pending orders can be edited');
    }

    // Check if customer exists (if provided)
    if (customerId) {
      const [customerRows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM clients WHERE id = ?',
        [customerId]
      );
      if (customerRows.length === 0) {
        throw new Error('Customer not found');
      }
    }

    // If products are being updated, validate and handle stock
    if (products) {
      // First restore original stock
      const [originalItems] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
        [id]
      );

      for (const item of originalItems) {
        await connection.execute(
          'UPDATE products SET stock = stock + ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }

      // Delete original items
      await connection.execute('DELETE FROM order_items WHERE order_id = ?', [id]);

      // Validate new products and check stock
      for (const item of products) {
        const [productRows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT id, stock, name FROM products WHERE id = ? AND is_active = TRUE',
          [item.productId]
        );
        
        if (productRows.length === 0) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        if (productRows[0].stock < item.quantity) {
          throw new Error(`Insufficient stock for product "${productRows[0].name}". Available: ${productRows[0].stock}, Requested: ${item.quantity}`);
        }
      }

      // Insert new items and reduce stock
      let totalAmount = 0;
      for (const item of products) {
        const subtotal = item.price * item.quantity;
        
        await connection.execute(
          `INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) 
           VALUES (?, ?, ?, ?, ?)`,
          [id, item.productId, item.quantity, item.price, subtotal]
        );

        // Reduce stock
        await connection.execute(
          'UPDATE products SET stock = stock - ? WHERE id = ?',
          [item.quantity, item.productId]
        );

        totalAmount += subtotal;
      }

      // Update total amount
      await connection.execute(
        'UPDATE orders SET total_amount = ? WHERE id = ?',
        [totalAmount, id]
      );
    }

    // Update order details
    const updateFields: string[] = [];
    const updateValues: (string | number)[] = [];

    if (customerId) {
      updateFields.push('customer_id = ?');
      updateValues.push(customerId);
    }
    if (notes !== undefined) {
      updateFields.push('notes = ?');
      updateValues.push(notes);
    }
    updateFields.push('updated_by = ?');
    updateValues.push(userId);
    updateValues.push(parseInt(id));

    if (updateFields.length > 1) {
      await connection.execute(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Commit transaction
    await connection.commit();

    // Fetch updated order
    const [updatedOrderRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    const order = await transformOrder(updatedOrderRows[0], connection);

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: { order }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating order:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update order',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    connection.release();
  }
});

// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const connection = await getPool().getConnection();
  
  try {
    // Validate input
    const validationResult = updateStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        error: validationResult.error.errors[0].message
      });
      return;
    }

    const { id } = req.params;
    const newStatus = validationResult.data.status;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    // Start transaction
    await connection.beginTransaction();

    // Check if order exists
    const [orderRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    if (orderRows.length === 0) {
      throw new Error('Order not found');
    }

    const currentOrder = orderRows[0];
    const currentStatus = currentOrder.status as OrderStatus;

    // Validate status transition
    const allowedTransitions = validStatusTransitions[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }

    // Role-based checks
    if (newStatus === 'Approved' && !['admin', 'manager', 'sub-admin'].includes(userRole)) {
      throw new Error('Only admin or manager can approve orders');
    }

    if (newStatus === 'Dispatched' && !['admin', 'manager', 'sub-admin', 'dispatcher'].includes(userRole)) {
      // Note: dispatcher role may need to be added to user roles
      throw new Error('Only admin, manager, or dispatcher can mark orders as dispatched');
    }

    // Handle stock restoration for cancellation
    if (newStatus === 'Cancelled') {
      const [orderItems] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
        [id]
      );

      for (const item of orderItems) {
        await connection.execute(
          'UPDATE products SET stock = stock + ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }
    }

    // Update order status
    await connection.execute(
      'UPDATE orders SET status = ?, updated_by = ? WHERE id = ?',
      [newStatus, userId, id]
    );

    // Insert status history
    await connection.execute(
      'INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)',
      [id, newStatus, userId]
    );

    // Auto-generate invoice when order is approved
    let autoGeneratedInvoice: { id: number; invoiceNumber: string; total: number } | null = null;
    if (newStatus === 'Approved') {
      // Check if invoice already exists for this order
      const [existingInvoice] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM invoices WHERE order_id = ?',
        [id]
      );
      
      if (existingInvoice.length === 0) {
        // Get order items
        const [orderItemRows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
          [id]
        );
        
        if (orderItemRows.length > 0) {
          // Transform order items to invoice items
          const items = orderItemRows.map((item: any) => ({
            description: item.product_name,
            quantity: item.quantity,
            rate: parseFloat(item.price),
          }));
          
          // Calculate subtotal
          const subtotal = items.reduce((sum: number, item: any) => sum + (item.quantity * item.rate), 0);
          
          // Default 18% GST
          const taxAmount = subtotal * 0.18;
          const discount = 0;
          const total = subtotal + taxAmount - discount;
          
          // Generate invoice number
          const year = new Date().getFullYear();
          const [countRows] = await connection.execute<mysql.RowDataPacket[]>(
            "SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE ?",
            [`INV-${year}%`]
          );
          const count = (countRows[0]?.count || 0) + 1;
          const invoiceNumber = `INV-${year}-${String(count).padStart(4, '0')}`;
          
          const today = new Date().toISOString().split('T')[0];
          
          // Insert invoice
          const [result] = await connection.execute<mysql.ResultSetHeader>(
            `INSERT INTO invoices (invoice_number, order_id, client_id, date, due_date, amount, tax, discount, total, status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, NOW(), NOW())`,
            [invoiceNumber, id, currentOrder.customer_id, today, null, subtotal, taxAmount, discount, total, currentOrder.notes || null]
          );
          
          // Insert invoice items
          for (const item of items) {
            const itemAmount = item.quantity * item.rate;
            await connection.execute(
              `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)`,
              [result.insertId, item.description, item.quantity, item.rate, itemAmount]
            );
          }
          
          // Get the generated invoice
          const [newInvoiceRows] = await connection.execute<mysql.RowDataPacket[]>(
            'SELECT * FROM invoices WHERE id = ?',
            [result.insertId]
          );
          
          if (newInvoiceRows.length > 0) {
            autoGeneratedInvoice = {
              id: newInvoiceRows[0].id,
              invoiceNumber: newInvoiceRows[0].invoice_number,
              total: parseFloat(newInvoiceRows[0].total.toString())
            };
          }
        }
      }
    }

    // Commit transaction
    await connection.commit();

    // Fetch updated order
    const [updatedOrderRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    const order = await transformOrder(updatedOrderRows[0], connection);

    res.json({
      success: true,
      message: newStatus === 'Approved' && autoGeneratedInvoice 
        ? `Order approved. Invoice ${autoGeneratedInvoice.invoiceNumber} generated automatically.`
        : `Order status updated to ${newStatus}`,
      data: { order, autoGeneratedInvoice }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating order status:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update order status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    connection.release();
  }
});

// DELETE /api/orders/:id - Cancel order
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const connection = await getPool().getConnection();
  
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Start transaction
    await connection.beginTransaction();

    // Check if order exists
    const [orderRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    if (orderRows.length === 0) {
      throw new Error('Order not found');
    }

    const currentOrder = orderRows[0];

    // Only allow cancellation of Pending or Approved orders
    if (!['Pending', 'Approved'].includes(currentOrder.status)) {
      throw new Error('Only pending or approved orders can be cancelled');
    }

    // Restore stock
    const [orderItems] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
      [id]
    );

    for (const item of orderItems) {
      await connection.execute(
        'UPDATE products SET stock = stock + ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    // Update order status to Cancelled
    await connection.execute(
      'UPDATE orders SET status = ?, updated_by = ? WHERE id = ?',
      ['Cancelled', userId, id]
    );

    // Insert status history
    await connection.execute(
      'INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)',
      [id, 'Cancelled', userId]
    );

    // Commit transaction
    await connection.commit();

    // Fetch updated order
    const [updatedOrderRows] = await connection.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    );

    const order = await transformOrder(updatedOrderRows[0], connection);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error cancelling order:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to cancel order',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    connection.release();
  }
});

// GET /api/orders/products/list - Get all products for order
router.get('/products/list', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { search } = req.query;

    let query = 'SELECT * FROM products WHERE is_active = TRUE';
    const params: string[] = [];

    if (search && typeof search === 'string') {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY name ASC';

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);

    const products: Product[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      price: parseFloat(row.price),
      stock: row.stock,
      unit: row.unit,
      description: row.description,
      minQuantity: row.min_quantity,
      status: row.stock === 0 ? 'Out of Stock' : row.stock <= row.min_quantity ? 'Low Stock' : 'In Stock',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

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

export default router;
