// Attendance route handlers
import { Router, Request, Response } from 'express';
import { getPool } from '../config/database';

const router = Router();

// Create attendance table if not exists
async function ensureAttendanceTable(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not connected');
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(255) NOT NULL,
      check_in_time DATETIME NOT NULL,
      check_out_time DATETIME,
      total_time VARCHAR(255),
      report TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_employee_id (employee_id),
      INDEX idx_check_in_time (check_in_time)
    )
  `);
}

// POST /api/attendance/checkin - Record check-in time
router.post('/checkin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId, checkInTime } = req.body;

    // Validate required fields
    if (!employeeId || !checkInTime) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: employeeId, checkInTime',
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(500).json({
        success: false,
        message: 'Database not connected',
      });
      return;
    }

    // Ensure table exists
    await ensureAttendanceTable();

    // Check if employee already has an incomplete attendance for today (checked in but not checked out)
    const [existing] = await pool.execute(
      `SELECT id FROM attendance 
       WHERE employee_id = ? AND DATE(check_in_time) = CURDATE() 
       AND check_out_time IS NULL
       LIMIT 1`,
      [employeeId]
    );

    const existingRecords = existing as any[];
    if (existingRecords.length > 0) {
      // Employee already has an active check-in for today
      res.status(400).json({
        success: false,
        message: 'You have already checked in today. Please check out first.',
      });
      return;
    }

    // Check if employee already completed attendance today (checked out)
    const [completed] = await pool.execute(
      `SELECT id FROM attendance 
       WHERE employee_id = ? AND DATE(check_in_time) = CURDATE() 
       AND check_out_time IS NOT NULL
       LIMIT 1`,
      [employeeId]
    );

    const completedRecords = completed as any[];
    if (completedRecords.length > 0) {
      res.status(400).json({
        success: false,
        message: 'You have already completed your attendance for today. Check-in will be available from tomorrow.',
      });
      return;
    }

    // Insert attendance record with check-in time
    const [result] = await pool.execute(
      `INSERT INTO attendance (employee_id, check_in_time) VALUES (?, ?)`,
      [employeeId, checkInTime]
    );

    const insertId = (result as any).insertId;

    res.status(201).json({
      success: true,
      message: 'Check-in recorded successfully',
      data: {
        attendance: {
          id: insertId,
          employeeId,
          checkInTime,
        },
        hasCheckedIn: true,
        hasCompletedToday: false,
      },
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record check-in',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/attendance/checkout - Submit checkout with report
router.post('/checkout', async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId, checkInTime, checkOutTime, totalTime, report } = req.body;

    // Validate required fields
    if (!employeeId || !checkInTime || !checkOutTime || !totalTime || !report) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: employeeId, checkInTime, checkOutTime, totalTime, report',
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(500).json({
        success: false,
        message: 'Database not connected',
      });
      return;
    }

    // Ensure table exists
    await ensureAttendanceTable();

    // Insert attendance record
    const [result] = await pool.execute(
      `INSERT INTO attendance (employee_id, check_in_time, check_out_time, total_time, report) 
       VALUES (?, ?, ?, ?, ?)`,
      [employeeId, checkInTime, checkOutTime, totalTime, report]
    );

    const insertId = (result as any).insertId;

    res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully',
      data: {
        attendance: {
          id: insertId,
          employeeId,
          checkInTime,
          checkOutTime,
          totalTime,
          report,
          createdAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record attendance',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/attendance/today - Get today's attendance for current employee
router.get('/today', async (req: Request, res: Response): Promise<void> => {
  try {
    const employeeId = req.headers['x-employee-id'] as string;
    
    console.log('[Attendance Today] Employee ID from header:', employeeId);

    if (!employeeId) {
      res.status(400).json({
        success: false,
        message: 'Employee ID is required in x-employee-id header',
      });
      return;
    }

    const pool = getPool();
    if (!pool) {
      res.status(500).json({
        success: false,
        message: 'Database not connected',
      });
      return;
    }

    // First check if there's ANY attendance record for today
    const [allRows] = await pool.execute(
      `SELECT id, check_in_time, check_out_time FROM attendance 
       WHERE employee_id = ? AND DATE(check_in_time) = CURDATE() 
       ORDER BY check_in_time DESC`,
      [employeeId]
    );
    
    const allAttendance = allRows as any[];
    console.log('[Attendance Today] All records for today:', allAttendance.length, allAttendance);

    if (allAttendance.length === 0) {
      res.json({
        success: true,
        data: {
          attendance: null,
          hasCheckedIn: false,
          hasCompletedToday: false,
        },
      });
      return;
    }

    // Check if any record has check_out_time (meaning completed)
    const completedRecord = allAttendance.find(record => record.check_out_time !== null);
    
    if (completedRecord) {
      console.log('[Attendance Today] Found completed record:', completedRecord.id);
      res.json({
        success: true,
        data: {
          attendance: completedRecord,
          hasCheckedIn: true,
          hasCompletedToday: true,
        },
      });
      return;
    }

    // Has checked in but not completed
    const todayRecord = allAttendance[0];
    res.json({
      success: true,
      data: {
        attendance: todayRecord,
        hasCheckedIn: true,
        hasCompletedToday: false,
      },
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/attendance - Get all attendance records (for admin)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, employeeId } = req.query;

    const pool = getPool();
    if (!pool) {
      res.status(500).json({
        success: false,
        message: 'Database not connected',
      });
      return;
    }

    let query = `
      SELECT 
        a.id,
        a.employee_id,
        a.check_in_time,
        a.check_out_time,
        a.total_time,
        a.report,
        a.created_at,
        e.first_name,
        e.last_name,
        e.department
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (date) {
      query += ' AND DATE(a.check_in_time) = ?';
      params.push(date);
    }

    if (employeeId) {
      query += ' AND a.employee_id = ?';
      params.push(employeeId);
    }

    query += ' ORDER BY a.check_in_time DESC';

    const [rows] = await pool.execute(query, params);

    res.json({
      success: true,
      data: {
        attendance: rows,
      },
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance records',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
