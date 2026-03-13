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

export async function connectDatabase(): Promise<void> {
  const config = getConfig();
  
  console.log('Connecting to MySQL database...');
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Database: ${config.database}`);

  try {
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
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
