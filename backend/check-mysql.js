import { pool } from './db.js'

const tables = [
  'users',
  'guardians',
  'drivers',
  'vehicles',
  'routes',
  'trips',
  'students',
  'vehicle_locations',
  'sessions',
]

try {
  for (const table of tables) {
    const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``)

    console.log(`\n=== ${table} ===`)

    for (const row of rows) {
      console.log(`${row.Field} | ${row.Type} | ${row.Null} | ${row.Key}`)
    }
  }
} catch (error) {
  console.error('❌ Erro ao verificar MySQL:')
  console.error(error.message)
} finally {
  await pool.end()
}
