import 'dotenv/config'
import mysql from 'mysql2/promise'

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'carrinha_escolar'
})

const [rows] = await connection.query('SELECT 1 AS teste')

console.log('✅ Conexão MySQL funcionando!')
console.log(rows)

await connection.end()
