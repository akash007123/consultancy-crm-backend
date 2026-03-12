// Employee management routes
import { Router, Response, NextFunction, Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { getPool } from '../config/database';
import mysql from 'mysql2/promise';
import {
  Employee,
  EmployeeWithoutPassword,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  EmployeeRole,
  EmployeeStatus,
  ApiResponse
} from '../types/index';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Validation schema for creating employee
const createEmployeeSchema = z.object({
  employeeCode: z.string().min(1, 'Employee code is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email format'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.string().optional(),
  joiningDate: z.string().min(1, 'Joining date is required'),
  department: z.string().min(1, 'Department is required'),
  role: z.enum(['admin', 'manager', 'hr', 'employee']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  mobile1: z.string().min(10, 'Mobile number is required'),
  mobile2: z.string().optional(),
  address: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  ifscCode: z.string().optional(),
  bankAddress: z.string().optional(),
  facebook: z.string().optional(),
  twitter: z.string().optional(),
  linkedin: z.string().optional(),
  instagram: z.string().optional(),
  otherSocial: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Validation schema for updating employee
const updateEmployeeSchema = z.object({
  id: z.number(),
  employeeCode: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.string().optional(),
  joiningDate: z.string().optional(),
  department: z.string().optional(),
  role: z.enum(['admin', 'manager', 'hr', 'employee']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  mobile1: z.string().min(10).optional(),
  mobile2: z.string().optional(),
  address: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  ifscCode: z.string().optional(),
  bankAddress: z.string().optional(),
  facebook: z.string().optional(),
  twitter: z.string().optional(),
  linkedin: z.string().optional(),
  instagram: z.string().optional(),
  otherSocial: z.string().optional(),
  password: z.string().min(6).optional(),
});

// Format database row to EmployeeWithoutPassword
function formatEmployee(row: Record<string, unknown>): EmployeeWithoutPassword {
  return {
    id: row.id as number,
    employeeCode: row.employee_code as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: row.email as string,
    gender: row.gender as EmployeeWithoutPassword['gender'],
    dateOfBirth: row.date_of_birth ? (row.date_of_birth as Date).toISOString().split('T')[0] : '',
    joiningDate: row.joining_date ? (row.joining_date as Date).toISOString().split('T')[0] : '',
    department: row.department as string,
    role: row.role as EmployeeRole,
    status: row.status as EmployeeStatus,
    mobile1: row.mobile1 as string,
    mobile2: row.mobile2 as string || '',
    address: row.address as string || '',
    bankAccountName: row.bank_account_name as string || '',
    bankAccountNumber: row.bank_account_number as string || '',
    bankName: row.bank_name as string || '',
    ifscCode: row.ifsc_code as string || '',
    bankAddress: row.bank_address as string || '',
    facebook: row.facebook as string || '',
    twitter: row.twitter as string || '',
    linkedin: row.linkedin as string || '',
    instagram: row.instagram as string || '',
    otherSocial: row.other_social as string || '',
    profilePhoto: row.profile_photo as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

// Generate employee code
async function generateEmployeeCode(pool: mysql.Pool): Promise<string> {
  const [rows] = await pool.execute('SELECT MAX(id) as maxId FROM employees');
  const maxId = (rows as Array<{ maxId: number | null }>)[0]?.maxId || 0;
  return `EMP${String(maxId + 1).padStart(3, '0')}`;
}

// Generate JWT token for employee
function generateToken(employee: EmployeeWithoutPassword): string {
  const payload = {
    userId: employee.id,
    email: employee.email,
    role: employee.role,
    type: 'employee',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
}

/**
 * GET /api/employees
 * Get all employees (with optional search)
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const { search, department, status } = req.query;

    let query = 'SELECT * FROM employees WHERE 1=1';
    const params: (string | number)[] = [];

    if (search && typeof search === 'string') {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR employee_code LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (department && typeof department === 'string') {
      query += ' AND department = ?';
      params.push(department);
    }

    if (status && typeof status === 'string') {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY id DESC';

    const [rows] = await pool.execute(query, params);
    const employees = (rows as Record<string, unknown>[]).map(formatEmployee);

    const response: ApiResponse = {
      success: true,
      data: { employees },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/employees/:id
 * Get single employee by ID
 */
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    const [rows] = await pool.execute(
      'SELECT * FROM employees WHERE id = ?',
      [id]
    );

    const employees = rows as Record<string, unknown>[];

    if (employees.length === 0) {
      throw new AppError('Employee not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      data: { employee: formatEmployee(employees[0]) },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/employees
 * Create new employee
 */
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Validate request
    const validatedData = createEmployeeSchema.parse(req.body) as CreateEmployeeRequest;
    const pool = getPool();

    // Check if employee with same email or mobile exists
    const [existing] = await pool.execute(
      'SELECT id FROM employees WHERE email = ? OR mobile1 = ? OR employee_code = ?',
      [validatedData.email, validatedData.mobile1, validatedData.employeeCode]
    );

    if ((existing as Array<{ id: number }>).length > 0) {
      throw new AppError('Employee with this email, mobile or employee code already exists', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Insert new employee
    const [result] = await pool.execute(
      `INSERT INTO employees (
        employee_code, first_name, last_name, email, gender, date_of_birth,
        joining_date, department, role, status, mobile1, mobile2, address,
        bank_account_name, bank_account_number, bank_name, ifsc_code, bank_address,
        facebook, twitter, linkedin, instagram, other_social, password
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        validatedData.employeeCode,
        validatedData.firstName,
        validatedData.lastName,
        validatedData.email,
        validatedData.gender || 'other',
        validatedData.dateOfBirth || null,
        validatedData.joiningDate,
        validatedData.department,
        validatedData.role || 'employee',
        validatedData.status || 'active',
        validatedData.mobile1,
        validatedData.mobile2 || null,
        validatedData.address || null,
        validatedData.bankAccountName || null,
        validatedData.bankAccountNumber || null,
        validatedData.bankName || null,
        validatedData.ifscCode || null,
        validatedData.bankAddress || null,
        validatedData.facebook || null,
        validatedData.twitter || null,
        validatedData.linkedin || null,
        validatedData.instagram || null,
        validatedData.otherSocial || null,
        hashedPassword,
      ]
    );

    // Get the created employee
    const [newEmployeeRows] = await pool.execute(
      'SELECT * FROM employees WHERE id = ?',
      [(result as { insertId: number }).insertId]
    );

    const newEmployee = formatEmployee((newEmployeeRows as Record<string, unknown>[])[0]);
    const token = generateToken(newEmployee);

    const response: ApiResponse = {
      success: true,
      message: 'Employee created successfully',
      data: {
        employee: newEmployee,
        token,
      },
    };

    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
  }
});

/**
 * PUT /api/employees/:id
 * Update employee
 */
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = updateEmployeeSchema.parse({ ...req.body, id: parseInt(id) }) as UpdateEmployeeRequest;
    const pool = getPool();

    // Check if employee exists
    const [existing] = await pool.execute(
      'SELECT * FROM employees WHERE id = ?',
      [id]
    );

    if ((existing as Record<string, unknown>[]).length === 0) {
      throw new AppError('Employee not found', 404);
    }

    // Check for duplicate email/mobile (excluding current employee)
    if (validatedData.email || validatedData.mobile1) {
      const [duplicates] = await pool.execute(
        'SELECT id FROM employees WHERE (email = ? OR mobile1 = ?) AND id != ?',
        [validatedData.email || '', validatedData.mobile1 || '', id]
      );

      if ((duplicates as Array<{ id: number }>).length > 0) {
        throw new AppError('Employee with this email or mobile already exists', 409);
      }
    }

    // Build update query
    const updates: string[] = [];
    const params: unknown[] = [];

    if (validatedData.employeeCode) {
      updates.push('employee_code = ?');
      params.push(validatedData.employeeCode);
    }
    if (validatedData.firstName) {
      updates.push('first_name = ?');
      params.push(validatedData.firstName);
    }
    if (validatedData.lastName) {
      updates.push('last_name = ?');
      params.push(validatedData.lastName);
    }
    if (validatedData.email) {
      updates.push('email = ?');
      params.push(validatedData.email);
    }
    if (validatedData.gender) {
      updates.push('gender = ?');
      params.push(validatedData.gender);
    }
    if (validatedData.dateOfBirth) {
      updates.push('date_of_birth = ?');
      params.push(validatedData.dateOfBirth);
    }
    if (validatedData.joiningDate) {
      updates.push('joining_date = ?');
      params.push(validatedData.joiningDate);
    }
    if (validatedData.department) {
      updates.push('department = ?');
      params.push(validatedData.department);
    }
    if (validatedData.role) {
      updates.push('role = ?');
      params.push(validatedData.role);
    }
    if (validatedData.status) {
      updates.push('status = ?');
      params.push(validatedData.status);
    }
    if (validatedData.mobile1) {
      updates.push('mobile1 = ?');
      params.push(validatedData.mobile1);
    }
    if (validatedData.mobile2 !== undefined) {
      updates.push('mobile2 = ?');
      params.push(validatedData.mobile2);
    }
    if (validatedData.address !== undefined) {
      updates.push('address = ?');
      params.push(validatedData.address);
    }
    if (validatedData.bankAccountName !== undefined) {
      updates.push('bank_account_name = ?');
      params.push(validatedData.bankAccountName);
    }
    if (validatedData.bankAccountNumber !== undefined) {
      updates.push('bank_account_number = ?');
      params.push(validatedData.bankAccountNumber);
    }
    if (validatedData.bankName !== undefined) {
      updates.push('bank_name = ?');
      params.push(validatedData.bankName);
    }
    if (validatedData.ifscCode !== undefined) {
      updates.push('ifsc_code = ?');
      params.push(validatedData.ifscCode);
    }
    if (validatedData.bankAddress !== undefined) {
      updates.push('bank_address = ?');
      params.push(validatedData.bankAddress);
    }
    if (validatedData.facebook !== undefined) {
      updates.push('facebook = ?');
      params.push(validatedData.facebook);
    }
    if (validatedData.twitter !== undefined) {
      updates.push('twitter = ?');
      params.push(validatedData.twitter);
    }
    if (validatedData.linkedin !== undefined) {
      updates.push('linkedin = ?');
      params.push(validatedData.linkedin);
    }
    if (validatedData.instagram !== undefined) {
      updates.push('instagram = ?');
      params.push(validatedData.instagram);
    }
    if (validatedData.otherSocial !== undefined) {
      updates.push('other_social = ?');
      params.push(validatedData.otherSocial);
    }
    if (validatedData.password) {
      updates.push('password = ?');
      params.push(await bcrypt.hash(validatedData.password, 10));
    }

    if (updates.length > 0) {
      params.push(id);
      await pool.execute(
        `UPDATE employees SET ${updates.join(', ')} WHERE id = ?`,
        params as unknown as string[]
      );
    }

    // Get updated employee
    const [updatedRows] = await pool.execute(
      'SELECT * FROM employees WHERE id = ?',
      [id]
    );

    const updatedEmployee = formatEmployee((updatedRows as Record<string, unknown>[])[0]);

    const response: ApiResponse = {
      success: true,
      message: 'Employee updated successfully',
      data: { employee: updatedEmployee },
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(error.errors[0].message, 400));
    } else {
      next(error);
    }
  }
});

/**
 * DELETE /api/employees/:id
 * Delete employee
 */
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const pool = getPool();

    // Check if employee exists
    const [existing] = await pool.execute(
      'SELECT id FROM employees WHERE id = ?',
      [id]
    );

    if ((existing as Record<string, unknown>[]).length === 0) {
      throw new AppError('Employee not found', 404);
    }

    // Delete employee
    await pool.execute('DELETE FROM employees WHERE id = ?', [id]);

    const response: ApiResponse = {
      success: true,
      message: 'Employee deleted successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/employees/login
 * Employee login with mobile and password
 */
router.post('/login', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      throw new AppError('Mobile and password are required', 400);
    }

    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM employees WHERE mobile1 = ?',
      [mobile]
    );

    const employees = rows as Record<string, unknown>[];

    if (employees.length === 0) {
      throw new AppError('Invalid mobile number or password', 401);
    }

    const employee = employees[0];

    // Check if employee is active
    if (employee.status !== 'active') {
      throw new AppError('Your account has been deactivated', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, employee.password as string);
    if (!isValidPassword) {
      throw new AppError('Invalid mobile number or password', 401);
    }

    const employeeWithoutPassword = formatEmployee(employee);
    const token = generateToken(employeeWithoutPassword);

    const response: ApiResponse = {
      success: true,
      message: 'Login successful',
      data: {
        employee: employeeWithoutPassword,
        token,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/employees/code/generate
 * Generate new employee code
 */
router.get('/code/generate', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const employeeCode = await generateEmployeeCode(pool);

    const response: ApiResponse = {
      success: true,
      data: { employeeCode },
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
