// Contact management routes
import { Router, Response, NextFunction, Request } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import { Contact, CreateContactRequest, UpdateContactRequest, ContactStatus } from '../types/index';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating contact (public - no auth required)
const createContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(10, 'Phone number is required'),
  companyName: z.string().optional().or(z.literal('')),
  message: z.string().optional().or(z.literal('')),
});

// Validation schema for updating contact
const updateContactSchema = z.object({
  id: z.number(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
  companyName: z.string().optional().or(z.literal('')),
  message: z.string().optional().or(z.literal('')),
  status: z.enum(['new', 'contacted', 'in-progress', 'resolved', 'closed']).optional(),
});

// Format database row to Contact
function formatContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as number,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: row.email as string,
    phone: row.phone as string,
    companyName: row.company_name as string | null,
    message: row.message as string | null,
    status: row.status as ContactStatus,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

// POST /api/contacts - Create new contact (public endpoint - no auth required)
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = createContactSchema.parse(req.body);
    
    const pool = getPool();
    
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO contacts (first_name, last_name, email, phone, company_name, message, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'new')`,
      [
        validatedData.firstName,
        validatedData.lastName,
        validatedData.email,
        validatedData.phone,
        validatedData.companyName || null,
        validatedData.message || null,
      ]
    );
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ?',
      [result.insertId]
    );
    
    const contact = formatContact(rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Thank you! We will get back to you shortly.',
      data: {
        contact,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'Validation failed',
        details: validationErrors,
      });
      return;
    }
    next(error);
  }
});

// GET /api/contacts - Get all contacts (requires auth)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    
    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params: (string | number)[] = [];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (search) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR company_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(query, params);
    const contacts = rows.map(formatContact);
    
    res.json({
      success: true,
      data: {
        contacts,
        total: contacts.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/:id - Get contact by ID (requires auth)
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const contactId = parseInt(req.params.id, 10);
    
    if (isNaN(contactId)) {
      throw new AppError('Invalid contact ID', 400);
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    
    if (rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }
    
    const contact = formatContact(rows[0]);
    
    res.json({
      success: true,
      data: {
        contact,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/contacts/:id - Update contact (requires auth)
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const contactId = parseInt(req.params.id, 10);
    
    if (isNaN(contactId)) {
      throw new AppError('Invalid contact ID', 400);
    }
    
    const validatedData = updateContactSchema.parse({ ...req.body, id: contactId });
    
    const pool = getPool();
    
    // Check if contact exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Contact not found', 404);
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    
    if (validatedData.firstName !== undefined) {
      updates.push('first_name = ?');
      params.push(validatedData.firstName);
    }
    if (validatedData.lastName !== undefined) {
      updates.push('last_name = ?');
      params.push(validatedData.lastName);
    }
    if (validatedData.email !== undefined) {
      updates.push('email = ?');
      params.push(validatedData.email);
    }
    if (validatedData.phone !== undefined) {
      updates.push('phone = ?');
      params.push(validatedData.phone);
    }
    if (validatedData.companyName !== undefined) {
      updates.push('company_name = ?');
      params.push(validatedData.companyName || null);
    }
    if (validatedData.message !== undefined) {
      updates.push('message = ?');
      params.push(validatedData.message || null);
    }
    if (validatedData.status !== undefined) {
      updates.push('status = ?');
      params.push(validatedData.status);
    }
    
    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }
    
    params.push(contactId);
    
    await pool.execute(
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    
    const contact = formatContact(rows[0]);
    
    res.json({
      success: true,
      message: 'Contact updated successfully',
      data: {
        contact,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'Validation failed',
        details: validationErrors,
      });
      return;
    }
    next(error);
  }
});

// DELETE /api/contacts/:id - Delete contact (requires auth)
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const contactId = parseInt(req.params.id, 10);
    
    if (isNaN(contactId)) {
      throw new AppError('Invalid contact ID', 400);
    }
    
    // Check if contact exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Contact not found', 404);
    }
    
    await pool.execute('DELETE FROM contacts WHERE id = ?', [contactId]);
    
    res.json({
      success: true,
      message: 'Contact deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/contacts/:id/status - Update contact status (requires auth)
router.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const contactId = parseInt(req.params.id, 10);
    const { status } = req.body;
    
    if (isNaN(contactId)) {
      throw new AppError('Invalid contact ID', 400);
    }
    
    if (!status || !['new', 'contacted', 'in-progress', 'resolved', 'closed'].includes(status)) {
      throw new AppError('Invalid status value', 400);
    }
    
    // Check if contact exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    
    if (existingRows.length === 0) {
      throw new AppError('Contact not found', 404);
    }
    
    await pool.execute(
      'UPDATE contacts SET status = ? WHERE id = ?',
      [status, contactId]
    );
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );
    
    const contact = formatContact(rows[0]);
    
    res.json({
      success: true,
      message: 'Contact status updated successfully',
      data: {
        contact,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
