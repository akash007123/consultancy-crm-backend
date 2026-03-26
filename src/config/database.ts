// Database configuration and connection management
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

let pool: mysql.Pool | null = null;

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function getConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hireedge_crm',
  };
}

function getSSLConfig(): mysql.SslOptions | undefined {
  const host = process.env.DB_HOST || 'localhost';
  
  // Skip SSL for local development
  if (host === 'localhost' || host === '127.0.0.1') {
    return undefined;
  }
  
  // For TiDB Cloud serverless tier, SSL is required
  const caCertPath = process.env.CA;
  if (caCertPath) {
    try {
      const fs = require('fs');
      const path = require('path');
      const resolvedPath = path.resolve(caCertPath);
      return {
        ca: fs.readFileSync(resolvedPath),
      };
    } catch (error) {
      console.warn('Failed to load SSL certificate, using default SSL');
      return {}; // Use default SSL if certificate file not found
    }
  }
  return {}; // Enable SSL by default for remote databases
}

export async function connectDatabase(): Promise<void> {
  const config = getConfig();
  
  console.log('Connecting to MySQL database...');
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Database: ${config.database}`);

  try {
    const sslConfig = getSSLConfig();
    
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: sslConfig,
    });

    // Test the connection
    const connection = await pool.getConnection();
    console.log('Database connected successfully!');
    
    // Create tables if they don't exist
    await createTables(connection);
    
    connection.release();
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

async function createTables(connection: mysql.PoolConnection): Promise<void> {
  // Users table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      mobile VARCHAR(20) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'sub-admin', 'manager', 'hr', 'employee') DEFAULT 'employee',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_mobile (mobile),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Create default admin user if not exists
  const [existingAdminRows]: [any[], any] = await connection.execute(
    'SELECT id FROM users WHERE mobile = ?',
    ['9876543210']
  );

  if (existingAdminRows.length === 0) {
    // Insert default admin (password: admin123 - will be hashed)
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await connection.execute(
      `INSERT INTO users (name, email, mobile, password, role) VALUES (?, ?, ?, ?, ?)`,
      ['Rajesh Kumar', 'admin@hireedge.com', '9876543210', hashedPassword, 'admin']
    );
    console.log('Default admin user created');
  }

  // Employees table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_code VARCHAR(20) UNIQUE NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      gender ENUM('male', 'female', 'other') DEFAULT 'other',
      date_of_birth DATE,
      joining_date DATE NOT NULL,
      department VARCHAR(100) NOT NULL,
      role ENUM('admin', 'manager', 'hr', 'employee') DEFAULT 'employee',
      status ENUM('active', 'inactive') DEFAULT 'active',
      mobile1 VARCHAR(20) NOT NULL,
      mobile2 VARCHAR(20),
      address TEXT,
      bank_account_name VARCHAR(255),
      bank_account_number VARCHAR(50),
      bank_name VARCHAR(255),
      ifsc_code VARCHAR(20),
      bank_address TEXT,
      facebook VARCHAR(255),
      twitter VARCHAR(255),
      linkedin VARCHAR(255),
      instagram VARCHAR(255),
      other_social TEXT,
      password VARCHAR(255) NOT NULL,
      profile_photo LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_employee_code (employee_code),
      INDEX idx_email (email),
      INDEX idx_mobile1 (mobile1),
      INDEX idx_department (department),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Update profile_photo column to LONGTEXT if it exists (for existing databases)
  await connection.execute(`
    ALTER TABLE employees MODIFY COLUMN profile_photo LONGTEXT
  `).catch(() => {
    // Ignore error if column doesn't exist or already LONGTEXT
  });

  // Visits table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      employee_id INT NOT NULL,
      date DATE NOT NULL,
      check_in_time VARCHAR(20) NOT NULL,
      check_out_time VARCHAR(20),
      location VARCHAR(255) NOT NULL,
      remarks TEXT,
      purpose VARCHAR(255),
      outcome VARCHAR(255),
      next_followup DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_client_id (client_id),
      INDEX idx_employee_id (employee_id),
      INDEX idx_date (date),
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Clients table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_name VARCHAR(255) NOT NULL,
      company_name VARCHAR(255) NOT NULL,
      mobile VARCHAR(20) NOT NULL,
      email VARCHAR(255),
      industry VARCHAR(100),
      address TEXT,
      profile_photo LONGTEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company_name (company_name),
      INDEX idx_mobile (mobile),
      INDEX idx_email (email),
      INDEX idx_industry (industry)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Contacts table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      company_name VARCHAR(255),
      message TEXT,
      status ENUM('new', 'contacted', 'in-progress', 'resolved', 'closed') NOT NULL DEFAULT 'new',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email),
      INDEX idx_phone (phone),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Tasks table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      priority ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
      assignee_id INT NOT NULL,
      assign_date DATE NOT NULL,
      due_date DATE NOT NULL,
      status ENUM('in-progress', 'pending', 'completed') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_assignee_id (assignee_id),
      INDEX idx_priority (priority),
      INDEX idx_status (status),
      INDEX idx_due_date (due_date),
      FOREIGN KEY (assignee_id) REFERENCES employees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Candidates table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      position VARCHAR(255) NOT NULL,
      status ENUM('Shortlisted', 'Pending', 'Interview Scheduled', 'Applied', 'Offer Sent', 'Accepted Offer') NOT NULL DEFAULT 'Pending',
      email VARCHAR(255),
      phone VARCHAR(20),
      resume_url TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_name (name),
      INDEX idx_position (position),
      INDEX idx_status (status),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Job Posts table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS job_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      date DATE NOT NULL,
      type ENUM('Full-time', 'Part-time', 'Contract', 'Internship') NOT NULL,
      location VARCHAR(255) NOT NULL,
      experience VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      position INT NOT NULL DEFAULT 1,
      status ENUM('Active', 'Closed') NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_title (title),
      INDEX idx_type (type),
      INDEX idx_location (location),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Job Applications table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS job_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_id INT NOT NULL,
      job_title VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      mobile VARCHAR(20),
      education VARCHAR(255),
      address TEXT,
      resume_url TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'Applied',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_job_id (job_id),
      INDEX idx_name (name),
      INDEX idx_email (email),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Expenses table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category VARCHAR(255) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // TA/DA table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS tada (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      ta DECIMAL(10, 2) NOT NULL DEFAULT 0,
      da DECIMAL(10, 2) NOT NULL DEFAULT 0,
      date DATE NOT NULL,
      approval ENUM('Approved', 'Pending (Manager)', 'Pending (Admin)') NOT NULL DEFAULT 'Pending (Manager)',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_employee_id (employee_id),
      INDEX idx_date (date),
      INDEX idx_approval (approval),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Petrol Allowance table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS petrol_allowance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      distance DECIMAL(10, 2) NOT NULL,
      rate DECIMAL(10, 2) NOT NULL DEFAULT 12,
      date DATE NOT NULL,
      status ENUM('Approved', 'Pending') NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_employee_id (employee_id),
      INDEX idx_date (date),
      INDEX idx_status (status),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Stock table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS stock (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      unit VARCHAR(50) NOT NULL,
      description TEXT,
      min_quantity INT NOT NULL DEFAULT 10,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_name (name),
      INDEX idx_quantity (quantity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Insert sample stock data if empty
  const [stockRows]: [any[], any] = await connection.execute('SELECT COUNT(*) as count FROM stock');
  if (stockRows[0].count === 0) {
    await connection.execute(`
      INSERT INTO stock (name, quantity, unit, description, min_quantity) VALUES
      ('Product Brochures', 500, 'pcs', 'Marketing brochures for distribution', 50),
      ('Company Merchandise', 120, 'pcs', 'Branded merchandise items', 20),
      ('Welcome Kits', 25, 'kits', 'New employee welcome kits', 10),
      ('ID Cards', 200, 'pcs', 'Employee ID cards', 50)
    `);
    console.log('Sample stock data inserted');
  }

  // Stock Transactions table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS stock_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      stock_item_id INT NOT NULL,
      type ENUM('IN', 'OUT') NOT NULL,
      quantity INT NOT NULL,
      date DATE NOT NULL,
      source_dest VARCHAR(255) NOT NULL,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_stock_item_id (stock_item_id),
      INDEX idx_type (type),
      INDEX idx_date (date),
      FOREIGN KEY (stock_item_id) REFERENCES stock(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Insert sample stock transactions if empty
  const [transRows]: [any[], any] = await connection.execute('SELECT COUNT(*) as count FROM stock_transactions');
  if (transRows[0].count === 0) {
    // First ensure stock items exist
    const [items]: [any[], any] = await connection.execute('SELECT id, name FROM stock');
    
    if (items.length > 0) {
      const itemMap: Record<string, number> = {};
      items.forEach((item: any) => {
        itemMap[item.name] = item.id;
      });

      // Insert transactions using available stock item IDs
      const firstItemId = items[0].id;
      const secondItemId = items[1]?.id || firstItemId;
      const thirdItemId = items[2]?.id || firstItemId;
      const fourthItemId = items[3]?.id || firstItemId;

      await connection.execute(`
        INSERT INTO stock_transactions (stock_item_id, type, quantity, date, source_dest, remarks) VALUES
        (?, 'IN', 1000, '2024-01-15', 'Head Office', 'Initial stock received'),
        (?, 'OUT', 200, '2024-01-14', 'North Distributor', 'Stock transferred to distributor'),
        (?, 'IN', 100, '2024-01-13', 'Vendor Supply', 'New supply received'),
        (?, 'OUT', 50, '2024-01-12', 'East Distributor', 'Stock transferred to distributor'),
        (?, 'IN', 500, '2024-01-11', 'Factory', 'Production batch received')
      `, [
        firstItemId,
        secondItemId,
        thirdItemId,
        fourthItemId,
        firstItemId
      ]);
      console.log('Sample stock transactions inserted');
    } else {
      console.log('No stock items found, skipping stock transactions insertion');
    }
  }

  // Invoices table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(50) UNIQUE NOT NULL,
      order_id INT DEFAULT NULL,
      client_id INT NOT NULL,
      date DATE NOT NULL,
      due_date DATE,
      amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
      tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
      discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
      total DECIMAL(10, 2) NOT NULL DEFAULT 0,
      status ENUM('Pending', 'Paid', 'Cancelled') NOT NULL DEFAULT 'Pending',
      notes TEXT,
      payment_method VARCHAR(50),
      paid_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_invoice_number (invoice_number),
      INDEX idx_client_id (client_id),
      INDEX idx_order_id (order_id),
      INDEX idx_date (date),
      INDEX idx_status (status),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add columns if they don't exist (for existing databases)
  try {
    await connection.execute(`ALTER TABLE invoices ADD COLUMN order_id INT DEFAULT NULL AFTER invoice_number`);
  } catch (e) {
    // Column already exists
  }
  try {
    await connection.execute(`ALTER TABLE invoices ADD COLUMN discount DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER tax`);
  } catch (e) {
    // Column already exists
  }

  // Invoice items table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      description TEXT NOT NULL,
      quantity INT NOT NULL,
      rate DECIMAL(10, 2) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Insert sample invoices if empty
  const [invRows]: [any[], any] = await connection.execute('SELECT COUNT(*) as count FROM invoices');
  if (invRows[0].count === 0) {
    // Get client IDs
    const [clients]: [any[], any] = await connection.execute('SELECT id FROM clients LIMIT 3');
    
    if (clients.length > 0) {
      const clientId = clients[0].id;
      
      await connection.execute(`
        INSERT INTO invoices (invoice_number, client_id, date, due_date, amount, tax, total, status, notes) VALUES
        (?, ?, '2026-03-08', '2026-03-22', 100000, 25000, 125000, 'Paid', 'IT Staffing Services'),
        (?, ?, '2026-03-05', '2026-03-19', 68000, 17000, 85000, 'Pending', 'Consulting Services'),
        (?, ?, '2026-02-28', '2026-03-14', 168000, 42000, 210000, 'Paid', 'Recruitment Services')
      `, [`INV-2026-0001`, clientId, `INV-2026-0002`, clientId, `INV-2026-0003`, clientId]);
      
      // Add invoice items
      await connection.execute(`
        INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES
        (1, 'Staffing Services - March 2026', 1, 100000, 100000),
        (2, 'Consulting - Process Optimization', 1, 68000, 68000),
        (3, 'Recruitment - Senior Developers', 1, 168000, 168000)
      `);
      
      console.log('Sample invoices inserted');
    }
  }

  // Products table (extending stock with pricing)
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10, 2) NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0,
      unit VARCHAR(50) NOT NULL DEFAULT 'piece',
      description TEXT,
      min_quantity INT DEFAULT 10,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_name (name),
      INDEX idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Insert sample products if empty
  const [prodRows]: [any[], any] = await connection.execute('SELECT COUNT(*) as count FROM products');
  if (prodRows[0].count === 0) {
    await connection.execute(`
      INSERT INTO products (name, price, stock, unit, description, min_quantity) VALUES
      ('Laptop - Dell XPS 15', 89999, 25, 'piece', 'Dell XPS 15 - 16GB RAM, 512GB SSD', 5),
      ('Laptop - MacBook Pro', 149999, 15, 'piece', 'MacBook Pro M3 - 16GB RAM, 512GB SSD', 3),
      ('Mouse - Wireless', 899, 100, 'piece', 'Logitech MX Master 3 Wireless Mouse', 20),
      ('Keyboard - Mechanical', 4999, 50, 'piece', 'Keychron K8 Pro Mechanical Keyboard', 10),
      ('Monitor - 27 inch', 18999, 30, 'piece', 'LG UltraGear 27" 144Hz Monitor', 8),
      ('Headphone - Noise Cancelling', 12999, 40, 'piece', 'Sony WH-1000XM5', 10),
      ('USB-C Hub', 2499, 75, 'piece', 'Dockteck 7-in-1 USB-C Hub', 15),
      ('Webcam - 4K', 8999, 20, 'piece', 'Logitech Brio 4K Webcam', 5)
    `);
    console.log('Sample products inserted');
  }

  // Orders table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT NOT NULL,
      total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
      status ENUM('Pending', 'Approved', 'Dispatched', 'Delivered', 'Cancelled') DEFAULT 'Pending',
      notes TEXT,
      created_by INT NOT NULL,
      updated_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_order_number (order_number),
      INDEX idx_customer_id (customer_id),
      INDEX idx_status (status),
      INDEX idx_created_by (created_by),
      FOREIGN KEY (customer_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Order items table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      subtotal DECIMAL(12, 2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Order status history table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      status VARCHAR(20) NOT NULL,
      changed_by INT NOT NULL,
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Saved reports table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS saved_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      report_type VARCHAR(50) NOT NULL,
      filters JSON,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_report_type (report_type),
      INDEX idx_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Insert sample saved reports if empty
  const [srRows]: [any[], any] = await connection.execute('SELECT COUNT(*) as count FROM saved_reports');
  if (srRows[0].count === 0) {
    await connection.execute(`
      INSERT INTO saved_reports (name, report_type, filters, created_by) VALUES
      ('Monthly Employee Summary', 'employee', '{"month": "2026-03"}', 1),
      ('Q1 Visit Report', 'visit', '{"quarter": "Q1"}', 1),
      ('March Expenses', 'expense', '{"month": "2026-03"}', 1)
    `);
    console.log('Sample saved reports inserted');
  }

  // Events table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      event_date DATE NOT NULL,
      event_time TIME,
      end_time TIME,
      all_day BOOLEAN DEFAULT FALSE,
      type ENUM('meeting', 'task', 'reminder', 'event') NOT NULL DEFAULT 'event',
      assigned_to VARCHAR(255),
      location VARCHAR(255),
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_event_date (event_date),
      INDEX idx_type (type),
      INDEX idx_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('Database tables verified/created');
}

export function getPool(): mysql.Pool {
  if (!pool) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection closed');
  }
}
