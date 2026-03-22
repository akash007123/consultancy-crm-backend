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

// Event types
export type EventType = 'meeting' | 'task' | 'reminder' | 'event';

export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  eventDate: string;
  eventTime: string | null;
  endTime: string | null;
  allDay: boolean;
  type: EventType;
  assignedTo: string | null;
  location: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEventWithoutRelations {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  all_day: boolean;
  type: EventType;
  assigned_to: string | null;
  location: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  eventDate: string;
  eventTime?: string;
  endTime?: string;
  allDay?: boolean;
  type: EventType;
  assignedTo?: string;
  location?: string;
}

export interface UpdateEventRequest {
  id: number;
  title?: string;
  description?: string;
  eventDate?: string;
  eventTime?: string;
  endTime?: string;
  allDay?: boolean;
  type?: EventType;
  assignedTo?: string;
  location?: string;
}

// Expense types
export interface Expense {
  id: number;
  category: string;
  amount: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseWithoutRelations {
  id: number;
  category: string;
  amount: number;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateExpenseRequest {
  category: string;
  amount: number;
  description?: string;
}

export interface UpdateExpenseRequest extends Partial<CreateExpenseRequest> {
  id: number;
}

// TA/DA types
export type ApprovalStatus = 'Approved' | 'Pending (Manager)' | 'Pending (Admin)';

export interface TADA {
  id: number;
  employeeId: number;
  employeeName: string;
  ta: number;
  da: number;
  total: number;
  date: string;
  approval: ApprovalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TADAWithoutRelations {
  id: number;
  employee_id: number;
  ta: number;
  da: number;
  date: string;
  approval: ApprovalStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTADARequest {
  employeeId: number;
  ta: number;
  da: number;
  date: string;
  approval?: ApprovalStatus;
}

export interface UpdateTADARequest extends Partial<CreateTADARequest> {
  id: number;
}

// Petrol Allowance types
export type PetrolAllowanceStatus = 'Approved' | 'Pending';

export interface PetrolAllowance {
  id: number;
  employeeId: number;
  employeeName: string;
  distance: number;
  rate: number;
  total: number;
  date: string;
  status: PetrolAllowanceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PetrolAllowanceWithoutRelations {
  id: number;
  employee_id: number;
  distance: number;
  rate: number;
  date: string;
  status: PetrolAllowanceStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePetrolAllowanceRequest {
  employeeId: number;
  distance: number;
  rate: number;
  date: string;
  status?: PetrolAllowanceStatus;
}

export interface UpdatePetrolAllowanceRequest extends Partial<CreatePetrolAllowanceRequest> {
  id: number;
}

// Contact types
export type ContactStatus = 'new' | 'contacted' | 'in-progress' | 'resolved' | 'closed';

export interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string | null;
  message: string | null;
  status: ContactStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactWithoutRelations {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company_name: string | null;
  message: string | null;
  status: ContactStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreateContactRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName?: string;
  message?: string;
}

export interface UpdateContactRequest {
  id: number;
  status?: ContactStatus;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  message?: string;
}

// Stock types
export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

export interface Stock {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  status: StockStatus;
  description: string | null;
  minQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockWithoutRelations {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  status: StockStatus;
  description: string | null;
  min_quantity: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateStockRequest {
  name: string;
  quantity: number;
  unit: string;
  description?: string;
  minQuantity?: number;
}

export interface UpdateStockRequest extends Partial<CreateStockRequest> {
  id: number;
}

// Stock Transaction types (for Master Distributor Stock)
export type StockTransactionType = 'IN' | 'OUT';

export interface StockTransaction {
  id: number;
  stockItemId: number;
  stockItemName: string;
  type: StockTransactionType;
  quantity: number;
  date: string;
  sourceDest: string;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockTransactionWithoutRelations {
  id: number;
  stock_item_id: number;
  type: StockTransactionType;
  quantity: number;
  date: string;
  source_dest: string;
  remarks: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateStockTransactionRequest {
  stockItemId: number;
  type: StockTransactionType;
  quantity: number;
  date: string;
  sourceDest: string;
  remarks?: string;
}

export interface UpdateStockTransactionRequest extends Partial<CreateStockTransactionRequest> {
  id: number;
}

// Invoice types
export type InvoiceStatus = 'Pending' | 'Paid' | 'Cancelled';
export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI' | 'Credit Card' | 'Debit Card';

// Saved Report types
export type ReportType = 'employee' | 'visit' | 'attendance' | 'expense' | 'stock' | 'sales' | 'invoice';

export interface SavedReport {
  id: number;
  name: string;
  reportType: ReportType;
  filters: Record<string, unknown> | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedReportWithoutRelations {
  id: number;
  name: string;
  report_type: string;
  filters: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateReportRequest {
  name: string;
  reportType: ReportType;
  filters?: Record<string, unknown>;
}

export interface UpdateReportRequest {
  id: number;
  name?: string;
  reportType?: ReportType;
  filters?: Record<string, unknown>;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  clientId: number;
  clientName: string;
  clientCompany: string;
  date: string;
  dueDate: string | null;
  amount: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  items: InvoiceItem[];
  notes: string | null;
  paymentMethod: PaymentMethod | null;
  paidDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoiceWithoutRelations {
  id: number;
  invoice_number: string;
  client_id: number;
  date: string;
  due_date: string | null;
  amount: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
  payment_method: PaymentMethod | null;
  paid_date: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateInvoiceRequest {
  clientId: number;
  date: string;
  dueDate?: string;
  items: {
    description: string;
    quantity: number;
    rate: number;
  }[];
  tax?: number;
  notes?: string;
  paymentMethod?: PaymentMethod;
  status?: InvoiceStatus;
}

export interface UpdateInvoiceRequest extends Partial<CreateInvoiceRequest> {
  id: number;
}
