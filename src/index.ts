// Main entry point for the backend server
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { connectDatabase } from './config/database';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import attendanceRoutes from './routes/attendance';
import visitsRoutes from './routes/visits';
import clientsRoutes from './routes/clients';
import tasksRoutes from './routes/tasks';
import candidatesRoutes from './routes/candidates';
import jobPostsRoutes from './routes/jobPosts';
import jobApplicationsRoutes from './routes/jobApplications';
import expensesRoutes from './routes/expenses';
import tadaRoutes from './routes/tada';
import petrolAllowanceRoutes from './routes/petrolAllowance';
import stockRoutes from './routes/stock';
import stockTransactionRoutes from './routes/stockTransactions';
import invoiceRoutes from './routes/invoices';
import reportRoutes from './routes/reports';
import dashboardRoutes from './routes/dashboard';
import { errorHandler } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-employee-id']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/visits', visitsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/candidates', candidatesRoutes);
app.use('/api/job-posts', jobPostsRoutes);
app.use('/api/job-applications', jobApplicationsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/tada', tadaRoutes);
app.use('/api/petrol-allowance', petrolAllowanceRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/stock-transactions', stockTransactionRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
