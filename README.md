# HireEdge CRM Backend

Backend API for the HireEdge Consultancy CRM application.

## Prerequisites

- Node.js (v18 or higher)
- MySQL (v8.0 or higher)

## Setup Instructions

### 1. Install Dependencies

```bash
cd consultancy-crm-backend
npm install
```

### 2. Configure Environment Variables

Copy the `.env.example` file to `.env` and update the values:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=hireedge_crm

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
```

### 3. Create Database

Make sure MySQL is running, then create the database:

```bash
# Option 1: Run the setup script
npm run setup-db

# Option 2: Manual creation
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS hireedge_crm;"
```

### 4. Start the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

The server will run on `http://localhost:3001`

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/login` | Login with mobile & password | No |
| POST | `/api/auth/signup` | Register new user | No |
| GET | `/api/auth/me` | Get current user | Yes |
| POST | `/api/auth/logout` | Logout | Yes |
| PUT | `/api/auth/password` | Change password | Yes |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health status |

## Request/Response Examples

### POST /api/auth/login

**Request:**
```json
{
  "mobile": "9876543210",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "Rajesh Kumar",
      "email": "admin@hireedge.com",
      "mobile": "9876543210",
      "role": "admin",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### POST /api/auth/signup

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "9876543211",
  "password": "password123",
  "role": "employee"
}
```

## Default Admin User

A default admin user is created on first run:

- **Mobile:** 9876543210
- **Password:** admin123

## Project Structure

```
src/
├── config/
│   └── database.ts       # Database connection and schema
├── middleware/
│   ├── auth.ts          # JWT authentication middleware
│   └── errorHandler.ts  # Error handling middleware
├── routes/
│   └── auth.ts          # Authentication routes
├── scripts/
│   └── setup-db.ts      # Database setup script
├── types/
│   └── index.ts         # TypeScript type definitions
└── index.ts             # Main entry point
```

## Technologies Used

- **Express.js** - Web framework
- **TypeScript** - Type safety
- **MySQL** - Database
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Zod** - Input validation
- **CORS** - Cross-origin resource sharing

## Notes

- CORS is configured to allow all origins (`*`)
- Passwords are hashed using bcrypt (10 salt rounds)
- JWT tokens expire in 7 days by default
- All user roles: admin, sub-admin, manager, hr, employee
