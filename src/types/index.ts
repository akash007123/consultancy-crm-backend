// User types and interfaces
export type UserRole = 'admin' | 'sub-admin' | 'manager' | 'hr' | 'employee';

export interface User {
  id: number;
  name: string;
  email: string;
  mobile: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithoutPassword {
  id: number;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRequest {
  user?: UserWithoutPassword;
}

export interface LoginRequest {
  mobile: string;
  password: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  mobile: string;
  password: string;
  role?: UserRole;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface TokenPayload {
  userId: number;
  mobile: string;
  role: UserRole;
}

// Employee types
export type EmployeeRole = 'admin' | 'manager' | 'hr' | 'employee';
export type EmployeeStatus = 'active' | 'inactive';
export type EmployeeGender = 'male' | 'female' | 'other';

export interface Employee {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: EmployeeGender;
  dateOfBirth: string;
  joiningDate: string;
  department: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  mobile1: string;
  mobile2: string;
  address: string;
  // Banking Information
  bankAccountName: string;
  bankAccountNumber: string;
  bankName: string;
  ifscCode: string;
  bankAddress: string;
  // Social Media
  facebook: string;
  twitter: string;
  linkedin: string;
  instagram: string;
  otherSocial: string;
  // System fields
  password: string;
  profilePhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeWithoutPassword {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: EmployeeGender;
  dateOfBirth: string;
  joiningDate: string;
  department: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  mobile1: string;
  mobile2: string;
  address: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankName: string;
  ifscCode: string;
  bankAddress: string;
  facebook: string;
  twitter: string;
  linkedin: string;
  instagram: string;
  otherSocial: string;
  profilePhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEmployeeRequest {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: EmployeeGender;
  dateOfBirth: string;
  joiningDate: string;
  department: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  mobile1: string;
  mobile2?: string;
  address?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  ifscCode?: string;
  bankAddress?: string;
  facebook?: string;
  twitter?: string;
  linkedin?: string;
  instagram?: string;
  otherSocial?: string;
  password: string;
  profilePhoto?: string;
}

export interface UpdateEmployeeRequest extends Partial<CreateEmployeeRequest> {
  id: number;
}

// Visit types
export interface Visit {
  id: number;
  clientId: number;
  clientName: string;
  employeeId: number;
  employeeName: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  location: string;
  remarks: string | null;
  purpose: string | null;
  outcome: string | null;
  nextFollowup: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitWithoutRelations {
  id: number;
  client_id: number;
  employee_id: number;
  date: string;
  check_in_time: string;
  check_out_time: string | null;
  location: string;
  remarks: string | null;
  purpose: string | null;
  outcome: string | null;
  next_followup: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVisitRequest {
  clientId: number;
  employeeId: number;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  location: string;
  remarks?: string;
  purpose?: string;
  outcome?: string;
  nextFollowup?: string;
}

export interface UpdateVisitRequest extends Partial<CreateVisitRequest> {
  id: number;
}

export interface VisitListItem {
  id: number;
  clientId: number;
  clientName: string;
  employeeId: number;
  employeeName: string;
  date: string;
  checkIn: string;
  checkOut: string | null;
  location: string;
  remarks: string | null;
}

// Client types
export interface Client {
  id: number;
  clientName: string;
  companyName: string;
  mobile: string;
  email: string | null;
  industry: string | null;
  address: string | null;
  profilePhoto: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClientRequest {
  clientName: string;
  companyName: string;
  mobile: string;
  email?: string;
  industry?: string;
  address?: string;
  profilePhoto?: string;
}

export interface UpdateClientRequest extends Partial<CreateClientRequest> {
  id: number;
}

// Task types
export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'in-progress' | 'pending' | 'completed';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  assigneeId: number;
  assigneeName: string;
  assignDate: string;
  dueDate: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskWithoutRelations {
  id: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  assignee_id: number;
  assign_date: string;
  due_date: string;
  status: TaskStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority: TaskPriority;
  assigneeId: number;
  dueDate: string;
  status?: TaskStatus;
}

export interface UpdateTaskRequest {
  id?: number;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  assigneeId?: number;
  dueDate?: string;
  status?: TaskStatus;
}
