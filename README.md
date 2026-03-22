🚀 HireEdge CRM Backend
<p align="center"> <img src="https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js" /> <img src="https://img.shields.io/badge/TypeScript-StronglyTyped-blue?style=for-the-badge&logo=typescript" /> <img src="https://img.shields.io/badge/MySQL-8.0+-orange?style=for-the-badge&logo=mysql" /> <img src="https://img.shields.io/badge/Auth-JWT-red?style=for-the-badge&logo=jsonwebtokens" /> <img src="https://img.shields.io/badge/API-RESTful-purple?style=for-the-badge" /> </p>
📌 Overview

Backend API for the HireEdge Consultancy CRM system.
Designed with scalability, security, and clean architecture in mind.

⚙️ Prerequisites

Make sure you have installed:

🟢 Node.js (v18+)
🟡 MySQL (v8.0+)
🚀 Getting Started
1️⃣ Install Dependencies
cd consultancy-crm-backend
npm install
2️⃣ Setup Environment Variables
cp .env.example .env

Update .env:

# 🚀 Server Configuration
PORT=3001
NODE_ENV=development

# 🗄️ Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=hireedge_crm

# 🔐 JWT Configuration
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d
3️⃣ Database Setup
# ✅ Automatic setup
npm run setup-db

OR

# ⚡ Manual setup
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS hireedge_crm;"
4️⃣ Run Server
# 🔥 Development (Hot Reload)
npm run dev

# 🚀 Production
npm run build
npm start

📍 Server URL:
👉 http://localhost:3001

🔑 API Endpoints
🔐 Authentication APIs
Method	Endpoint	Description	Auth
POST	/api/auth/login	Login user	❌
POST	/api/auth/signup	Register user	❌
GET	/api/auth/me	Get user profile	✅
POST	/api/auth/logout	Logout	✅
PUT	/api/auth/password	Change password	✅
❤️ Health Check
Method	Endpoint	Description
GET	/api/health	Server status
📥 Request & Response Examples
🔐 Login
Request
{
  "mobile": "9876543210",
  "password": "admin123"
}
Response
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
      "isActive": true
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
📝 Signup
{
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "9876543211",
  "password": "password123",
  "role": "employee"
}
👤 Default Admin Access

Created automatically on first run

📱 Mobile: 9876543210
🔑 Password: admin123
📁 Project Structure
src/
├── config/
│   └── database.ts
├── middleware/
│   ├── auth.ts
│   └── errorHandler.ts
├── routes/
│   └── auth.ts
├── scripts/
│   └── setup-db.ts
├── types/
│   └── index.ts
└── index.ts
🛠️ Tech Stack
Technology	Purpose
⚡ Express.js	Backend Framework
🔷 TypeScript	Type Safety
🗄️ MySQL	Database
🔐 JWT	Authentication
🔒 bcryptjs	Password Hashing
✅ Zod	Validation
🌐 CORS	Cross-Origin Support
⚠️ Important Notes
🌍 CORS allows all origins (*)
🔐 Passwords hashed with bcrypt (10 rounds)
⏳ JWT expires in 7 days
👥 Roles:
admin
sub-admin
manager
hr
employee
⭐ Best Practices (Recommended)
Use strong JWT secret in production
Restrict CORS origins
Enable rate limiting
Use environment-based configs
🤝 Contributing

Pull requests are welcome!
For major changes, open an issue first.

📄 License

This project is licensed under the MIT License

💡 Author

Akash Raikwar
📧 akashraikwar763@gmail.com

If you want, I can also:

Add API documentation (Swagger)
Create a frontend README
Or design a GitHub portfolio-level README (with banner + animations)
give me in read me file formate

Here is your ready-to-use README.md file (just copy & paste into GitHub):

# 🚀 HireEdge CRM Backend

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js" />
  <img src="https://img.shields.io/badge/TypeScript-StronglyTyped-blue?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/MySQL-8.0+-orange?style=for-the-badge&logo=mysql" />
  <img src="https://img.shields.io/badge/Auth-JWT-red?style=for-the-badge&logo=jsonwebtokens" />
  <img src="https://img.shields.io/badge/API-RESTful-purple?style=for-the-badge" />
</p>

---

## 📌 Overview

Backend API for the **HireEdge Consultancy CRM** system.  
Built with scalability, security, and clean architecture.

---

## ⚙️ Prerequisites

- 🟢 Node.js (v18+)
- 🟡 MySQL (v8.0+)

---

## 🚀 Getting Started

### 1️⃣ Install Dependencies

```bash
cd consultancy-crm-backend
npm install
2️⃣ Setup Environment Variables
cp .env.example .env

Update .env:

# 🚀 Server Configuration
PORT=3001
NODE_ENV=development

# 🗄️ Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=hireedge_crm

# 🔐 JWT Configuration
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d
3️⃣ Database Setup
# ✅ Automatic setup
npm run setup-db

OR

# ⚡ Manual setup
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS hireedge_crm;"
4️⃣ Run Server
# 🔥 Development (Hot Reload)
npm run dev

# 🚀 Production
npm run build
npm start

📍 Server URL:
👉 http://localhost:3001

🔑 API Endpoints
🔐 Authentication APIs
Method	Endpoint	Description	Auth
POST	/api/auth/login	Login user	❌
POST	/api/auth/signup	Register user	❌
GET	/api/auth/me	Get user profile	✅
POST	/api/auth/logout	Logout	✅
PUT	/api/auth/password	Change password	✅
❤️ Health Check
Method	Endpoint	Description
GET	/api/health	Server status
📥 Request & Response Examples
🔐 Login
Request
{
  "mobile": "9876543210",
  "password": "admin123"
}
Response
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
      "isActive": true
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
📝 Signup
{
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "9876543211",
  "password": "password123",
  "role": "employee"
}
👤 Default Admin Access

Created automatically on first run

📱 Mobile: 9876543210
🔑 Password: admin123
📁 Project Structure
src/
├── config/
│   └── database.ts
├── middleware/
│   ├── auth.ts
│   └── errorHandler.ts
├── routes/
│   └── auth.ts
├── scripts/
│   └── setup-db.ts
├── types/
│   └── index.ts
└── index.ts
🛠️ Tech Stack
Technology	Purpose
⚡ Express.js	Backend Framework
🔷 TypeScript	Type Safety
🗄️ MySQL	Database
🔐 JWT	Authentication
🔒 bcryptjs	Password Hashing
✅ Zod	Validation
🌐 CORS	Cross-Origin Support
⚠️ Important Notes
🌍 CORS allows all origins (*)
🔐 Passwords hashed using bcrypt (10 rounds)
⏳ JWT expires in 7 days
👥 Roles:
admin
sub-admin
manager
hr
employee
⭐ Best Practices
Use strong JWT secret in production
Restrict CORS origins
Enable rate limiting
Use environment-based configs
🤝 Contributing

Pull requests are welcome.
For major changes, open an issue first.

📄 License

MIT License

💡 Author

Akash Raikwar
📧 akashraikwar763@gmail.com


---

If you want next level:
- 🔥 Animated banner README
- 📊 API Swagger docs
- 🌐 Deploy guide (AWS / VPS)

Just tell me 👍
