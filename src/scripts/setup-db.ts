// Database setup script - run this once to create the database
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';


dotenv.config();

async function setupDatabase() {
  const caPath = process.env.CA;
  
  const config: mysql.ConnectionOptions = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    ...(caPath && {
      ssl: {
        ca: fs.readFileSync(caPath)
      }
    })
  };

  let connection: mysql.Connection | null = null;

  try {
    console.log('Connecting to MySQL server...');
    connection = await mysql.createConnection(config);

    const dbName = process.env.DB_NAME || 'hireedge_crm';

    // Create database if not exists
    console.log(`Creating database "${dbName}" if not exists...`);
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbName} 
      CHARACTER SET utf8mb4 
      COLLATE utf8mb4_unicode_ci`);
    
    console.log(`Database "${dbName}" created or already exists!`);
    console.log('\nDatabase setup complete!');
    console.log('You can now start the server with: npm run dev');
    
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupDatabase();
