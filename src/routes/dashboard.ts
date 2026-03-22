// Dashboard statistics routes
import { Router, Response } from 'express';
import { getPool } from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Dashboard Stats interface
interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  totalClients: number;
  candidates: number;
  dailyVisits: number;
  attendanceRate: number;
  salesOrders: number;
  expenses: number;
}

interface MonthlyVisit {
  month: string;
  visits: number;
}

interface DailyAttendance {
  day: string;
  present: number;
  absent: number;
}

interface ExpenseByCategory {
  category: string;
  amount: number;
}

// GET /api/dashboard/stats - Get all dashboard statistics
router.get('/stats', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    // Get total employees count
    const [employeesResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active 
      FROM employees
    `);
    
    // Get total clients count
    const [clientsResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM clients WHERE is_active = 1
    `);
    
    // Get total candidates count
    const [candidatesResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM candidates
    `);
    
    // Get today's visits count
    const today = new Date().toISOString().split('T')[0];
    const [visitsResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM visits WHERE date = ?
    `, [today]);
    
    // Get this week's attendance
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];
    
    const [attendanceResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN check_out_time IS NOT NULL THEN 1 ELSE 0 END) as present
      FROM attendance 
      WHERE date >= ?
    `, [weekStartStr]);
    
    // Get total expenses
    const [expensesResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
    `);
    
    // Get sales orders count (invoices with paid status)
    const [invoicesResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM invoices WHERE status = 'Paid'
    `);
    
    const totalEmployees = employeesResult[0]?.total || 0;
    const activeEmployees = employeesResult[0]?.active || 0;
    const totalClients = clientsResult[0]?.total || 0;
    const candidates = candidatesResult[0]?.total || 0;
    const dailyVisits = visitsResult[0]?.total || 0;
    const attendanceTotal = attendanceResult[0]?.total || 1;
    const attendancePresent = attendanceResult[0]?.present || 0;
    const attendanceRate = Math.round((attendancePresent / attendanceTotal) * 100) || 0;
    const expenses = expensesResult[0]?.total || 0;
    const salesOrders = invoicesResult[0]?.total || 0;
    
    const stats: DashboardStats = {
      totalEmployees,
      activeEmployees,
      totalClients,
      candidates,
      dailyVisits,
      attendanceRate,
      salesOrders,
      expenses
    };
    
    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard statistics' });
  }
});

// GET /api/dashboard/monthly-visits - Get monthly visits for chart
router.get('/monthly-visits', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    
    const monthlyVisits: MonthlyVisit[] = [];
    
    for (let i = 0; i < 12; i++) {
      const monthStart = `${currentYear}-${String(i + 1).padStart(2, '0')}-01`;
      const monthEnd = i === 11 
        ? `${currentYear + 1}-01-01` 
        : `${currentYear}-${String(i + 2).padStart(2, '0')}-01`;
      
      const [result] = await pool.execute<mysql.RowDataPacket[]>(`
        SELECT COUNT(*) as total FROM visits 
        WHERE date >= ? AND date < ?
      `, [monthStart, monthEnd]);
      
      monthlyVisits.push({
        month: months[i],
        visits: result[0]?.total || 0
      });
    }
    
    res.json({
      success: true,
      data: { monthlyVisits }
    });
  } catch (error) {
    console.error('Error fetching monthly visits:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch monthly visits' });
  }
});

// GET /api/dashboard/weekly-attendance - Get weekly attendance for chart
router.get('/weekly-attendance', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyAttendance: DailyAttendance[] = [];
    
    // Get current week start
    const today = new Date();
    const currentDay = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - currentDay);
    
    // Get total employees
    const [empResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM employees WHERE status = 'active'
    `);
    const totalEmployees = empResult[0]?.total || 1;
    
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + i);
      const dateStr = dayDate.toISOString().split('T')[0];
      
      const [result] = await pool.execute<mysql.RowDataPacket[]>(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN check_out_time IS NOT NULL THEN 1 ELSE 0 END) as present
        FROM attendance 
        WHERE date = ?
      `, [dateStr]);
      
      const present = result[0]?.present || 0;
      const total = result[0]?.total || 0;
      
      weeklyAttendance.push({
        day: days[i],
        present: present,
        absent: totalEmployees - present
      });
    }
    
    res.json({
      success: true,
      data: { weeklyAttendance }
    });
  } catch (error) {
    console.error('Error fetching weekly attendance:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch weekly attendance' });
  }
});

// GET /api/dashboard/expense-breakdown - Get expense breakdown by category
router.get('/expense-breakdown', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [result] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT category, COALESCE(SUM(amount), 0) as total 
      FROM expenses 
      GROUP BY category 
      ORDER BY total DESC
    `);
    
    const expenseBreakdown: ExpenseByCategory[] = result.map((row) => ({
      category: row.category,
      amount: Number(row.total)
    }));
    
    res.json({
      success: true,
      data: { expenseBreakdown }
    });
  } catch (error) {
    console.error('Error fetching expense breakdown:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch expense breakdown' });
  }
});

export default router;

// Import mysql type
import mysql from 'mysql2/promise';
