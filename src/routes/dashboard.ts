// Dashboard statistics routes
import { Router, Response } from 'express';
import mysql from 'mysql2/promise';
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

// GET /api/dashboard/section-counts - Get counts for contacts, tasks, orders, products
router.get('/section-counts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    // Get contacts count
    const [contactsResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM contacts
    `);
    
    // Get tasks count
    const [tasksResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM tasks
    `);
    
    // Get orders count
    const [ordersResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM orders
    `);
    
    // Get products count
    const [productsResult] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT COUNT(*) as total FROM products WHERE is_active = 1
    `);
    
    const sectionCounts = {
      contacts: contactsResult[0]?.total || 0,
      tasks: tasksResult[0]?.total || 0,
      orders: ordersResult[0]?.total || 0,
      products: productsResult[0]?.total || 0
    };
    
    res.json({
      success: true,
      data: { sectionCounts }
    });
  } catch (error) {
    console.error('Error fetching section counts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch section counts' });
  }
});

// GET /api/dashboard/recent-contacts - Get last 5 contacts
router.get('/recent-contacts', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT id, first_name, last_name, email, phone, company_name, status, created_at
      FROM contacts
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    const recentContacts = rows.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      companyName: row.company_name,
      status: row.status,
      createdAt: row.created_at
    }));
    
    res.json({
      success: true,
      data: { recentContacts }
    });
  } catch (error) {
    console.error('Error fetching recent contacts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent contacts' });
  }
});

// GET /api/dashboard/recent-activities - Get recent activities and feeds
router.get('/recent-activities', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = getPool();
    const activities: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      timestamp: string;
      icon: string;
      color: string;
    }> = [];

    // Get recent clients (last 5)
    const [recentClients] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT id, client_name, company_name, created_at
      FROM clients
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 5
    `);

    recentClients.forEach(client => {
      activities.push({
        id: `client-${client.id}`,
        type: 'client_added',
        title: 'New client added',
        description: `${client.client_name} from ${client.company_name || 'N/A'} was added`,
        timestamp: client.created_at,
        icon: 'Building2',
        color: 'text-blue-500'
      });
    });

    // Get recent attendance (last 5 check-ins/check-outs)
    const [recentAttendance] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT a.id, a.check_in_time, a.check_out_time, a.created_at,
             e.first_name, e.last_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      ORDER BY a.created_at DESC
      LIMIT 5
    `);

    recentAttendance.forEach(att => {
      const employeeName = `${att.first_name} ${att.last_name}`;
      if (att.check_out_time) {
        activities.push({
          id: `attendance-out-${att.id}`,
          type: 'employee_checkout',
          title: 'Employee clocked out',
          description: `${employeeName} clocked out`,
          timestamp: att.check_out_time,
          icon: 'Clock',
          color: 'text-orange-500'
        });
      } else {
        activities.push({
          id: `attendance-in-${att.id}`,
          type: 'employee_checkin',
          title: 'Employee clocked in',
          description: `${employeeName} clocked in`,
          timestamp: att.check_in_time,
          icon: 'Clock',
          color: 'text-green-500'
        });
      }
    });

    // Get recent invoices (last 5)
    const [recentInvoices] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT i.id, i.invoice_number, i.total, i.status, i.created_at, c.client_name
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      ORDER BY i.created_at DESC
      LIMIT 5
    `);

    recentInvoices.forEach(invoice => {
      activities.push({
        id: `invoice-${invoice.id}`,
        type: 'invoice_generated',
        title: 'Invoice generated',
        description: `Invoice ${invoice.invoice_number} for ${invoice.client_name} - ₹${invoice.total}`,
        timestamp: invoice.created_at,
        icon: 'Receipt',
        color: 'text-purple-500'
      });
    });

    // Get low stock alerts (products with stock < min_quantity)
    const [lowStockProducts] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT id, name, stock, min_quantity, updated_at
      FROM products
      WHERE stock < min_quantity AND is_active = 1
      ORDER BY stock ASC
      LIMIT 5
    `);

    lowStockProducts.forEach(product => {
      activities.push({
        id: `stock-${product.id}`,
        type: 'low_stock_alert',
        title: 'Low stock alert',
        description: `${product.name} has only ${product.stock} units left (min: ${product.min_quantity})`,
        timestamp: product.updated_at,
        icon: 'Package',
        color: 'text-red-500'
      });
    });

    // Get recent orders (last 5)
    const [recentOrders] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT o.id, o.order_number, o.total_amount, o.status, o.created_at, c.client_name
      FROM orders o
      JOIN clients c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    recentOrders.forEach(order => {
      activities.push({
        id: `order-${order.id}`,
        type: 'order_placed',
        title: 'New order placed',
        description: `Order ${order.order_number} from ${order.client_name} - ₹${order.total_amount}`,
        timestamp: order.created_at,
        icon: 'ShoppingCart',
        color: 'text-indigo-500'
      });
    });

    // Get recent tasks (last 5)
    const [recentTasks] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT id, title, status, created_at
      FROM tasks
      ORDER BY created_at DESC
      LIMIT 5
    `);

    recentTasks.forEach(task => {
      activities.push({
        id: `task-${task.id}`,
        type: 'task_created',
        title: 'New task created',
        description: `Task "${task.title}" was created`,
        timestamp: task.created_at,
        icon: 'CheckSquare',
        color: 'text-teal-500'
      });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Return top 15 activities
    const recentActivities = activities.slice(0, 15);

    res.json({
      success: true,
      data: { recentActivities }
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent activities' });
  }
});

export default router;
