// Event management routes
import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  CalendarEvent,
  CalendarEventWithoutRelations,
  CreateEventRequest,
  UpdateEventRequest,
  EventType,
  ApiResponse
} from '../types/index';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Validation schema for creating event
const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  eventDate: z.string().min(1, 'Event date is required'),
  eventTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  type: z.enum(['meeting', 'task', 'reminder', 'event']),
  assignedTo: z.string().optional(),
  location: z.string().optional()
});

// Validation schema for updating event
const updateEventSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  eventDate: z.string().min(1, 'Event date is required').optional(),
  eventTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  type: z.enum(['meeting', 'task', 'reminder', 'event']).optional(),
  assignedTo: z.string().optional(),
  location: z.string().optional()
});

// Helper function to transform database row to CalendarEvent object
function transformEvent(row: CalendarEventWithoutRelations): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    eventDate: row.event_date,
    eventTime: row.event_time,
    endTime: row.end_time,
    allDay: row.all_day,
    type: row.type,
    assignedTo: row.assigned_to,
    location: row.location,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/events - Get all events
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT * FROM events 
      ORDER BY event_date ASC, event_time ASC
    `);
    
    const events: CalendarEvent[] = rows.map(row => transformEvent(row as CalendarEventWithoutRelations));
    
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events'
    });
  }
});

// GET /api/events/:id - Get a single event by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    const event = transformEvent(rows[0] as CalendarEventWithoutRelations);
    
    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event'
    });
  }
});

// GET /api/events/date/:date - Get events by date
router.get('/date/:date', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date } = req.params;
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE event_date = ? ORDER BY event_time ASC',
      [date]
    );
    
    const events: CalendarEvent[] = rows.map(row => transformEvent(row as CalendarEventWithoutRelations));
    
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events by date:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events'
    });
  }
});

// GET /api/events/range - Get events within a date range
router.get('/range', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start, end } = req.query;
    const pool = getPool();
    
    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Start and end dates are required'
      });
    }
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE event_date BETWEEN ? AND ? ORDER BY event_date ASC, event_time ASC',
      [start, end]
    );
    
    const events: CalendarEvent[] = rows.map(row => transformEvent(row as CalendarEventWithoutRelations));
    
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events by range:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events'
    });
  }
});

// POST /api/events - Create a new event
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationResult = createEventSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data = validationResult.data;
    const { title, description, eventDate, eventTime, endTime, allDay, type, assignedTo, location } = data;
    
    const pool = getPool();
    
    const [result] = await pool.execute(
      `INSERT INTO events (title, description, event_date, event_time, end_time, all_day, type, assigned_to, location, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description || null,
        eventDate,
        eventTime || null,
        endTime || null,
        allDay || false,
        type,
        assignedTo || null,
        location || null,
        req.user?.id || null
      ]
    );
    
    const insertResult = result as mysql.ResultSetHeader;
    
    // Fetch the created event
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE id = ?',
      [insertResult.insertId]
    );
    
    if (rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve created event'
      });
    }
    
    const event = transformEvent(rows[0] as CalendarEventWithoutRelations);
    
    res.status(201).json({
      success: true,
      data: event,
      message: 'Event created successfully'
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create event'
    });
  }
});

// PUT /api/events/:id - Update an event
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const validationResult = updateEventSchema.safeParse({
      ...req.body,
      id: parseInt(id)
    });
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.errors[0].message
      });
    }
    
    const data = validationResult.data;
    const { title, description, eventDate, eventTime, endTime, allDay, type, assignedTo, location } = data;
    
    const pool = getPool();
    
    // Check if event exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description || null);
    }
    if (eventDate !== undefined) {
      updates.push('event_date = ?');
      values.push(eventDate);
    }
    if (eventTime !== undefined) {
      updates.push('event_time = ?');
      values.push(eventTime || null);
    }
    if (endTime !== undefined) {
      updates.push('end_time = ?');
      values.push(endTime || null);
    }
    if (allDay !== undefined) {
      updates.push('all_day = ?');
      values.push(allDay);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      values.push(type);
    }
    if (assignedTo !== undefined) {
      updates.push('assigned_to = ?');
      values.push(assignedTo || null);
    }
    if (location !== undefined) {
      updates.push('location = ?');
      values.push(location || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    values.push(parseInt(id));
    
    await pool.execute(
      'UPDATE events SET ' + updates.join(', ') + ' WHERE id = ?',
      values
    );
    
    // Fetch the updated event
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE id = ?',
      [id]
    );
    
    const event = transformEvent(rows[0] as CalendarEventWithoutRelations);
    
    res.json({
      success: true,
      data: event,
      message: 'Event updated successfully'
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update event'
    });
  }
});

// DELETE /api/events/:id - Delete an event
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    
    // Check if event exists
    const [existingRows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT * FROM events WHERE id = ?',
      [id]
    );
    
    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    await pool.execute('DELETE FROM events WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete event'
    });
  }
});

export default router;
