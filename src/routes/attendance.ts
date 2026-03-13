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

    const [rows] = await pool.execute(
      `SELECT * FROM attendance 
       WHERE employee_id = ? AND DATE(check_in_time) = CURDATE() 
       ORDER BY check_in_time DESC LIMIT 1`,
      [employeeId]
    );

    const attendance = rows as any[];

    if (attendance.length === 0) {
      res.json({
        success: true,
        data: {
          attendance: null,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        attendance: attendance[0],
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

    let query = 'SELECT * FROM attendance WHERE 1=1';
    const params: any[] = [];

    if (date) {
      query += ' AND DATE(check_in_time) = ?';
      params.push(date);
    }

    if (employeeId) {
      query += ' AND employee_id = ?';
      params.push(employeeId);
    }

    query += ' ORDER BY check_in_time DESC';

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
