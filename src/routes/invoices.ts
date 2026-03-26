// Invoice management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  Invoice,
  InvoiceWithoutRelations,
  InvoiceItem,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  PaymentUpdateRequest,
  InvoiceStatus,
  PaymentMethod,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating invoice
const createInvoiceSchema = z.object({
  orderId: z.number().int().positive().optional(),
  clientId: z.number().int().positive('Client is required'),
  date: z.string().min(1, 'Date is required'),
  dueDate: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1, 'Description is required'),
    quantity: z.number().int().positive('Quantity must be positive'),
    rate: z.number().positive('Rate must be positive'),
  })).min(1, 'At least one item is required'),
  tax: z.number().min(0).optional().default(0),
  discount: z.number().min(0).optional().default(0),
  notes: z.string().optional().default(''),
  paymentMethod: z.string().optional(),
  status: z.enum(['Pending', 'Paid', 'Cancelled']).optional().default('Pending'),
});

// Validation schema for updating invoice
const updateInvoiceSchema = z.object({
  id: z.number().int().positive('Valid invoice ID is required'),
  clientId: z.number().int().positive().optional(),
  date: z.string().optional(),
  dueDate: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().int().positive(),
    rate: z.number().positive(),
  })).optional(),
  tax: z.number().min(0).optional(),
  notes: z.string().optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(['Pending', 'Paid', 'Cancelled']).optional(),
});

// Helper to generate invoice number
async function generateInvoiceNumber(pool: mysql.Pool): Promise<string> {
  const year = new Date().getFullYear();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE ?",
    [`INV-${year}%`]
  );
  const count = (rows[0]?.count || 0) + 1;
  return `INV-${year}-${String(count).padStart(4, '0')}`;
}

// Helper to transform database row to Invoice object
async function transformInvoice(row: InvoiceWithoutRelations, pool: mysql.Pool): Promise<Invoice> {
  // Get client info
  const [clientRows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT client_name, company_name FROM clients WHERE id = ?',
    [row.client_id]
  );
  
  // Get order info if order_id exists
  let orderNumber: string | null = null;
  if (row.order_id) {
    const [orderRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT order_number FROM orders WHERE id = ?',
      [row.order_id]
    );
    orderNumber = orderRows[0]?.order_number || null;
  }
  
  // Get invoice items
  const [itemRows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT * FROM invoice_items WHERE invoice_id = ?',
    [row.id]
  );
  
  const items: InvoiceItem[] = itemRows.map(item => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    rate: parseFloat(item.rate),
    amount: parseFloat(item.amount),
  }));
  
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    orderId: row.order_id,
    clientId: row.client_id,
    clientName: clientRows[0]?.client_name || 'Unknown',
    clientCompany: clientRows[0]?.company_name || 'Unknown',
    date: row.date,
    dueDate: row.due_date,
    amount: parseFloat(row.amount.toString()),
    tax: parseFloat(row.tax.toString()),
    discount: parseFloat(row.discount?.toString() || '0'),
    total: parseFloat(row.total.toString()),
    status: row.status,
    items,
    notes: row.notes,
    paymentMethod: row.payment_method,
    paidDate: row.paid_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/invoices - Get all invoices
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const { status, clientId, search } = req.query;
    
    let query = 'SELECT * FROM invoices WHERE 1=1';
    const params: (string | number)[] = [];

    if (status && typeof status === 'string') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (clientId && typeof clientId === 'string') {
      query += ' AND client_id = ?';
      params.push(parseInt(clientId));
    }

    if (search && typeof search === 'string') {
      query += ' AND invoice_number LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY id DESC';

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);
    
    const invoices: Invoice[] = await Promise.all(
      rows.map(row => transformInvoice(row as InvoiceWithoutRelations, pool))
    );
    
    res.json({
      success: true,
      data: {
        invoices
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoices'
    });
  }
});

// GET /api/invoices/generate-number - Generate invoice number
router.get('/generate-number', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const invoiceNumber = await generateInvoiceNumber(pool);
    
    res.json({
      success: true,
      data: { invoiceNumber }
    });
  } catch (error) {
    console.error('Error generating invoice number:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice number'
    });
  }
});

// POST /api/invoices/generate/:orderId - Generate invoice from order
router.post('/generate/:orderId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const orderId = parseInt(req.params.orderId);
    
    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }
    
    // Check if order exists
    const [orderRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    );
    
    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    const order = orderRows[0];
    
    // Check if order is approved
    if (order.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        error: 'Order must be approved before generating invoice'
      });
    }
    
    // Check if invoice already exists for this order
    const [existingInvoiceRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM invoices WHERE order_id = ?',
      [orderId]
    );
    
    if (existingInvoiceRows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invoice already exists for this order'
      });
    }
    
    // Get order items
    const [orderItemRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
      [orderId]
    );
    
    if (orderItemRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Order has no items'
      });
    }
    
    // Transform order items to invoice items
    const items = orderItemRows.map(item => ({
      description: item.product_name,
      quantity: item.quantity,
      rate: parseFloat(item.price),
    }));
    
    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    
    // Get tax rate from request body or use default 18% (GST)
    const taxRate = req.body.taxRate || 18;
    const taxAmount = subtotal * (taxRate / 100);
    
    // Get discount from request body
    const discount = req.body.discount || 0;
    
    // Calculate total
    const total = subtotal + taxAmount - discount;
    
    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(pool);
    
    const today = new Date().toISOString().split('T')[0];
    
    // Insert invoice
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO invoices (invoice_number, order_id, client_id, date, due_date, amount, tax, discount, total, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, NOW(), NOW())`,
      [invoiceNumber, orderId, order.customer_id, today, req.body.dueDate || null, subtotal, taxAmount, discount, total, order.notes || null]
    );
    
    // Insert invoice items
    for (const item of items) {
      const itemAmount = item.quantity * item.rate;
      await pool.execute(
        `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, item.description, item.quantity, item.rate, itemAmount]
      );
    }
    
    // Get the created invoice
    const [newRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM invoices WHERE id = ?',
      [result.insertId]
    );
    
    const invoice = await transformInvoice(newRows[0] as InvoiceWithoutRelations, pool);
    
    res.status(201).json({
      success: true,
      message: 'Invoice generated successfully',
      data: {
        invoice
      }
    });
  } catch (error) {
    console.error('Error generating invoice from order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice'
    });
  }
});

// GET /api/invoices/:id - Get single invoice by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const invoiceId = parseInt(req.params.id);
    
    if (isNaN(invoiceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid invoice ID'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM invoices WHERE id = ?',
      [invoiceId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    const invoice = await transformInvoice(rows[0] as InvoiceWithoutRelations, pool);
    
    res.json({
      success: true,
      data: {
        invoice
      }
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice'
    });
  }
});

// POST /api/invoices - Create new invoice
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = createInvoiceSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { clientId, date, dueDate, items, tax, notes, paymentMethod, status } = validationResult.data as CreateInvoiceRequest;
    const pool = getPool();
    
    // Check if client exists
    const [clientRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM clients WHERE id = ?',
      [clientId]
    );
    
    if (clientRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Client not found'
      });
    }
    
    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    const taxAmount = tax || 0;
    const discountAmount = validationResult.data.discount || 0;
    const total = subtotal + taxAmount - discountAmount;
    
    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(pool);
    
    // Insert invoice
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO invoices (invoice_number, order_id, client_id, date, due_date, amount, tax, discount, total, status, notes, payment_method, paid_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [invoiceNumber, validationResult.data.orderId || null, clientId, date, dueDate || null, subtotal, taxAmount, discountAmount, total, status || 'Pending', notes || null, paymentMethod || null, status === 'Paid' ? date : null]
    );
    
    // Insert invoice items
    for (const item of items) {
      const itemAmount = item.quantity * item.rate;
      await pool.execute(
        `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, item.description, item.quantity, item.rate, itemAmount]
      );
    }
    
    // Get the created invoice
    const [newRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM invoices WHERE id = ?',
      [result.insertId]
    );
    
    const invoice = await transformInvoice(newRows[0] as InvoiceWithoutRelations, pool);
    
    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: {
        invoice
      }
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice'
    });
  }
});

// PUT /api/invoices/:id - Update invoice
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);
    
    if (isNaN(invoiceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid invoice ID'
      });
    }
    
    const validationResult = updateInvoiceSchema.safeParse({
      id: invoiceId,
      ...req.body
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const { clientId, date, dueDate, items, tax, notes, paymentMethod, status } = validationResult.data as UpdateInvoiceRequest;
    const pool = getPool();
    
    // Check if invoice exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM invoices WHERE id = ?',
      [invoiceId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    // Calculate totals if items are provided
    let subtotal = parseFloat(existingRows[0].amount.toString());
    let taxAmount = tax !== undefined ? tax : parseFloat(existingRows[0].tax.toString());
    let total = subtotal + taxAmount;
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    
    if (clientId !== undefined) {
      updates.push('client_id = ?');
      values.push(clientId);
    }
    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (dueDate !== undefined) {
      updates.push('due_date = ?');
      values.push(dueDate || null);
    }
    if (tax !== undefined) {
      updates.push('tax = ?');
      values.push(tax);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes || null);
    }
    if (paymentMethod !== undefined) {
      updates.push('payment_method = ?');
      values.push(paymentMethod || null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
      if (status === 'Paid') {
        updates.push('paid_date = ?');
        values.push(date || new Date().toISOString().split('T')[0]);
      }
    }
    
    // If items are provided, recalculate totals and update items
    if (items && items.length > 0) {
      subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
      total = subtotal + taxAmount;
      
      updates.push('amount = ?');
      values.push(subtotal);
      updates.push('total = ?');
      values.push(total);
      
      // Delete existing items and insert new ones
      await pool.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
      
      for (const item of items) {
        const itemAmount = item.quantity * item.rate;
        await pool.execute(
          `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)`,
          [invoiceId, item.description, item.quantity, item.rate, itemAmount]
        );
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push('updated_at = NOW()');
    values.push(invoiceId);
    
    const [updateResult] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    if (updateResult.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    // Get the updated invoice
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM invoices WHERE id = ?',
      [invoiceId]
    );
    
    const invoice = await transformInvoice(rows[0] as InvoiceWithoutRelations, pool);
    
    res.json({
      success: true,
      message: 'Invoice updated successfully',
      data: {
        invoice
      }
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update invoice'
    });
  }
});

// PUT /api/invoices/:id/pay - Update payment status
router.put('/:id/pay', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const invoiceId = parseInt(req.params.id);
    
    if (isNaN(invoiceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid invoice ID'
      });
    }
    
    const { paymentMethod, paidDate } = req.body;
    
    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'Payment method is required'
      });
    }
    
    // Check if invoice exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM invoices WHERE id = ?',
      [invoiceId]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    // Update invoice payment status
    const paymentDate = paidDate || new Date().toISOString().split('T')[0];
    
    await pool.execute(
      `UPDATE invoices SET status = 'Paid', payment_method = ?, paid_date = ?, updated_at = NOW() WHERE id = ?`,
      [paymentMethod, paymentDate, invoiceId]
    );
    
    // Get the updated invoice
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM invoices WHERE id = ?',
      [invoiceId]
    );
    
    const invoice = await transformInvoice(rows[0] as InvoiceWithoutRelations, pool);
    
    res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        invoice
      }
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record payment'
    });
  }
});

// DELETE /api/invoices/:id - Delete invoice
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const invoiceId = parseInt(req.params.id);
    
    if (isNaN(invoiceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid invoice ID'
      });
    }
    
    // Delete invoice items first (cascade should handle this, but being explicit)
    await pool.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'DELETE FROM invoices WHERE id = ?',
      [invoiceId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete invoice'
    });
  }
});

export default router;
