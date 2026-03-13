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
