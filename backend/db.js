import 'dotenv/config'
import mysql from 'mysql2/promise'

const isProduction = process.env.NODE_ENV === 'production'
const databaseHost = process.env.DB_HOST || (isProduction ? '' : '127.0.0.1')
const databasePort = Number(process.env.DB_PORT || (isProduction ? '' : 3306))
const databaseUser = process.env.DB_USER || (isProduction ? '' : 'root')
const databasePassword = process.env.DB_PASSWORD || ''
const databaseName = process.env.DB_NAME || (isProduction ? '' : 'carrinha_escolar')
const sslEnabled = process.env.DB_SSL?.trim().toLowerCase() === 'true'
const missingProductionSettings = [
  ['DB_HOST', databaseHost],
  ['DB_PORT', databasePort],
  ['DB_USER', databaseUser],
  ['DB_PASSWORD', databasePassword],
  ['DB_NAME', databaseName]
]
  .filter(([, value]) => value === '' || value === 0 || !value)
  .map(([key]) => key)

if (isProduction && missingProductionSettings.length) {
  throw new Error(
    `Variáveis de base de dados em falta: ${missingProductionSettings.join(', ')}.`
  )
}

if (isProduction && !sslEnabled) {
  throw new Error('DB_SSL=true é obrigatório em produção para ligar ao TiDB Cloud.')
}

if (isProduction && ['localhost', '127.0.0.1', '::1'].includes(databaseHost.toLowerCase())) {
  throw new Error('DB_HOST tem de apontar para uma base de dados remota em produção.')
}

if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
  throw new Error('DB_PORT tem de ser uma porta válida entre 1 e 65535.')
}

const sslCa = process.env.DB_SSL_CA?.replace(/\\n/g, '\n').trim()

export const pool = mysql.createPool({
  host: databaseHost,
  port: databasePort,
  user: databaseUser,
  password: databasePassword,
  database: databaseName,
  ssl: sslEnabled
    ? {
        minVersion: 'TLSv1.2',
        ...(sslCa ? { ca: sslCa } : {})
      }
    : undefined,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  charset: 'utf8mb4',
  dateStrings: true
})
