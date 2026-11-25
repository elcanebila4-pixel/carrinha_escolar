import { createServer } from 'node:http'
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import 'dotenv/config'
import { pool } from './db.js'

const scrypt = promisify(scryptCallback)

const loginAttempts = new Map()

class InputError extends Error {}

const hashToken = token => createHash('sha256').update(token).digest('hex')

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params)
  return result
}

async function ensureTransportRelationsSchema() {
  const guardianColumn = await query(
    "SHOW COLUMNS FROM users LIKE 'guardian_id'"
  )

  if (!guardianColumn.length) {
    try {
      await execute('ALTER TABLE users ADD COLUMN guardian_id INT NULL')
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    }
  }

  const columns = await query("SHOW COLUMNS FROM users LIKE 'driver_id'")

  if (!columns.length) {
    try {
      await execute('ALTER TABLE users ADD COLUMN driver_id INT NULL')
    } catch (error) {
      // Another server process may have applied the migration at the same time.
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    }
  }

  const guardianIndex = await query(
    "SHOW INDEX FROM users WHERE Key_name = 'users_guardian_unique'"
  )

  if (!guardianIndex.length) {
    const duplicateGuardians = await query(`
      SELECT guardian_id
      FROM users
      WHERE guardian_id IS NOT NULL
      GROUP BY guardian_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `)

    if (duplicateGuardians.length) {
      throw new Error(
        'Existem várias contas associadas ao mesmo encarregado. Corrija essas associações antes de iniciar o servidor.'
      )
    }

    try {
      await execute(
        'CREATE UNIQUE INDEX users_guardian_unique ON users (guardian_id)'
      )
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error
    }
  }

  const indexes = await query(
    "SHOW INDEX FROM users WHERE Key_name = 'users_driver_unique'"
  )

  if (!indexes.length) {
    try {
      await execute(
        'CREATE UNIQUE INDEX users_driver_unique ON users (driver_id)'
      )
    } catch (error) {
      // Another server process may have created the index at the same time.
      if (error.code !== 'ER_DUP_KEYNAME') throw error
    }
  }

  const studentColumns = await query(
    "SHOW COLUMNS FROM students LIKE 'route_id'"
  )
  if (!studentColumns.length) {
    try {
      await execute(
        'ALTER TABLE students ADD COLUMN route_id BIGINT UNSIGNED NULL'
      )
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    }
  }

  for (const [column, definition] of [
    ['photo_url', 'VARCHAR(2048) NULL'],
    ['school_name', 'VARCHAR(160) NULL'],
    ['school_phone', 'VARCHAR(40) NULL'],
    ['emergency_contact_name', 'VARCHAR(160) NULL'],
    ['emergency_contact_phone', 'VARCHAR(40) NULL']
  ]) {
    const existing = await query(`SHOW COLUMNS FROM students LIKE '${column}'`)
    if (!existing.length)
      await execute(`ALTER TABLE students ADD COLUMN ${column} ${definition}`)
  }

  const driverPhotoColumn = await query(
    "SHOW COLUMNS FROM drivers LIKE 'photo_url'"
  )
  if (!driverPhotoColumn.length) {
    await execute('ALTER TABLE drivers ADD COLUMN photo_url VARCHAR(2048) NULL')
  }

  for (const [column, definition] of [
    ['started_at', 'DATETIME NULL'],
    ['finished_at', 'DATETIME NULL']
  ]) {
    const existing = await query(`SHOW COLUMNS FROM trips LIKE '${column}'`)
    if (!existing.length) {
      await execute(`ALTER TABLE trips ADD COLUMN ${column} ${definition}`)
    }
  }

  const vehicleColumns = await query(
    "SHOW COLUMNS FROM vehicles LIKE 'driver_id'"
  )
  if (!vehicleColumns.length) {
    try {
      await execute(
        'ALTER TABLE vehicles ADD COLUMN driver_id BIGINT UNSIGNED NULL'
      )
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error
    }
  }

  const vehicleDriverIndexes = await query(
    "SHOW INDEX FROM vehicles WHERE Key_name = 'vehicles_driver_id_index'"
  )
  if (!vehicleDriverIndexes.length) {
    try {
      await execute(
        'CREATE INDEX vehicles_driver_id_index ON vehicles (driver_id)'
      )
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error
    }
  }

  const routeIndexes = await query(
    "SHOW INDEX FROM students WHERE Key_name = 'students_route_id_index'"
  )
  if (!routeIndexes.length) {
    try {
      await execute(
        'CREATE INDEX students_route_id_index ON students (route_id)'
      )
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') throw error
    }
  }

  await execute(`
    CREATE TABLE IF NOT EXISTS trip_student_status (
      trip_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(20) NOT NULL,
      recorded_at DATETIME NOT NULL,
      PRIMARY KEY (trip_id, student_id),
      INDEX trip_student_status_student_index (student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await execute(`
    CREATE TABLE IF NOT EXISTS trip_reports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      trip_id BIGINT UNSIGNED NOT NULL,
      driver_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(20) NOT NULL,
      description VARCHAR(1000) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX trip_reports_trip_index (trip_id),
      INDEX trip_reports_driver_index (driver_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await execute(`
    CREATE TABLE IF NOT EXISTS trip_student_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      trip_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(20) NOT NULL,
      recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX trip_student_events_history_index (student_id, recorded_at),
      INDEX trip_student_events_trip_index (trip_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await execute(`
    CREATE TABLE IF NOT EXISTS trip_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      trip_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(24) NOT NULL,
      recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX trip_events_trip_index (trip_id, recorded_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

// Add the driver account relation to databases created before driver accounts
// were introduced. This runs for both the API and the create-admin command.
await ensureTransportRelationsSchema()

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = await scrypt(password, salt, 64)

  return `${salt}:${derivedKey.toString('hex')}`
}

async function verifyPassword(password, storedHash) {
  try {
    const [salt, storedKey] = storedHash.split(':')

    if (!salt || !storedKey) return false

    const actualKey = await scrypt(password, salt, 64)
    const expectedKey = Buffer.from(storedKey, 'hex')

    return (
      actualKey.length === expectedKey.length &&
      timingSafeEqual(actualKey, expectedKey)
    )
  } catch {
    return false
  }
}

const dummyPasswordHash = await hashPassword(randomBytes(32).toString('hex'))

export async function createAccount(
  email,
  password,
  role = 'admin',
  guardianId = null,
  driverId = null
) {
  const normalizedEmail = email.trim().toLowerCase()

  if (!['admin', 'guardian', 'driver'].includes(role)) {
    throw new Error('O perfil da conta é inválido.')
  }

  if (
    (role === 'guardian' && (!guardianId || driverId)) ||
    (role === 'driver' && (!driverId || guardianId)) ||
    (role === 'admin' && (guardianId || driverId))
  ) {
    throw new Error(
      'A associação da conta não corresponde ao perfil selecionado.'
    )
  }

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw new Error('Informe um e-mail válido.')
  }

  if (password.length < 10) {
    throw new Error('A palavra-passe deve ter pelo menos 10 caracteres.')
  }

  const passwordHash = await hashPassword(password)

  try {
    await execute(
      `INSERT INTO users
       (email, password_hash, role, guardian_id, driver_id)
       VALUES (?, ?, ?, ?, ?)`,
      [normalizedEmail, passwordHash, role, guardianId, driverId]
    )
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error('Já existe uma conta com esse e-mail.')
    }

    throw error
  }
}

/*
|--------------------------------------------------------------------------
| Recursos administrativos
|--------------------------------------------------------------------------
*/

const resources = {
  drivers: {
    table: 'drivers',

    select: `
      SELECT drivers.*,
        EXISTS (
          SELECT 1
          FROM users
          WHERE users.driver_id = drivers.id
        ) AS has_account
      FROM drivers
    `,

    order: 'drivers.name',

    fields: {
      name: {
        type: 'text',
        required: true,
        max: 160
      },

      phone: {
        type: 'text',
        required: true,
        max: 40
      },

      license_number: {
        type: 'text',
        required: true,
        max: 80
      },

      license_expiry: {
        type: 'date',
        max: 10
      },

      photo_url: {
        type: 'text',
        max: 2048
      },

      notes: {
        type: 'text',
        max: 1000
      }
    }
  },

  vehicles: {
    table: 'vehicles',

    select: `
      SELECT vehicles.*, drivers.name AS driver_name
      FROM vehicles
      LEFT JOIN drivers ON drivers.id = vehicles.driver_id
    `,

    order: 'vehicles.plate',

    fields: {
      plate: {
        type: 'text',
        required: true,
        max: 30
      },

      model: {
        type: 'text',
        required: true,
        max: 100
      },

      capacity: {
        type: 'integer',
        required: true,
        min: 1,
        max: 100
      },

      year: {
        type: 'integer',
        min: 1950,
        max: new Date().getFullYear() + 1
      },

      status: {
        type: 'enum',
        required: true,
        values: ['active', 'maintenance']
      },

      driver_id: {
        type: 'foreign',
        table: 'drivers'
      },

      notes: {
        type: 'text',
        max: 1000
      }
    }
  },

  routes: {
    table: 'routes',

    select: `
      SELECT
        routes.*,
        vehicles.plate AS vehicle_plate,
        drivers.name AS driver_name
      FROM routes
      LEFT JOIN vehicles
        ON vehicles.id = routes.vehicle_id
      LEFT JOIN drivers
        ON drivers.id = routes.driver_id
    `,

    order: 'routes.name',

    fields: {
      name: {
        type: 'text',
        required: true,
        max: 120
      },

      start_point: {
        type: 'text',
        required: true,
        max: 180
      },

      end_point: {
        type: 'text',
        required: true,
        max: 180
      },

      end_latitude: {
        type: 'number',
        min: -90,
        max: 90
      },

      end_longitude: {
        type: 'number',
        min: -180,
        max: 180
      },

      departure_time: {
        type: 'time',
        max: 5
      },

      vehicle_id: {
        type: 'foreign',
        table: 'vehicles'
      },

      driver_id: {
        type: 'foreign',
        table: 'drivers'
      },

      notes: {
        type: 'text',
        max: 1000
      }
    }
  },

  trips: {
    table: 'trips',

    select: `
      SELECT
        trips.*,
        routes.name AS route_name,
        routes.start_point,
        routes.end_point,
        routes.vehicle_id,
        vehicles.plate AS vehicle_plate,
        routes.driver_id,
        drivers.name AS driver_name
      FROM trips
      JOIN routes
        ON routes.id = trips.route_id
      LEFT JOIN vehicles
        ON vehicles.id = routes.vehicle_id
      LEFT JOIN drivers
        ON drivers.id = routes.driver_id
    `,

    order: 'trips.trip_date DESC, trips.departure_time DESC',

    fields: {
      route_id: {
        type: 'foreign',
        required: true,
        table: 'routes'
      },

      trip_date: {
        type: 'date',
        required: true,
        max: 10
      },

      departure_time: {
        type: 'time',
        max: 5
      },

      status: {
        type: 'enum',
        required: true,
        values: ['scheduled', 'in_progress', 'completed', 'cancelled']
      },

      notes: {
        type: 'text',
        max: 1000
      }
    }
  }
}

/*
|--------------------------------------------------------------------------
| Validações
|--------------------------------------------------------------------------
*/

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

async function validateResource(resource, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InputError('Os dados enviados são inválidos.')
  }

  const record = {}

  for (const [field, rules] of Object.entries(resource.fields)) {
    const value = input[field]

    if (rules.type === 'number') {
      if (value === '' || value === undefined || value === null) {
        record[field] = null
      } else {
        const number = Number(value)

        if (
          !Number.isFinite(number) ||
          number < rules.min ||
          number > rules.max
        ) {
          throw new InputError(`O campo ${field} tem um valor inválido.`)
        }

        record[field] = number
      }

      continue
    }

    if (rules.type === 'integer') {
      if (value === '' || value === undefined || value === null) {
        if (rules.required) {
          throw new InputError(`O campo ${field} é obrigatório.`)
        }

        record[field] = null
      } else {
        const number = Number(value)

        if (
          !Number.isSafeInteger(number) ||
          number < rules.min ||
          number > rules.max
        ) {
          throw new InputError(`O campo ${field} tem um valor inválido.`)
        }

        record[field] = number
      }

      continue
    }

    if (rules.type === 'foreign') {
      if (value === '' || value === undefined || value === null) {
        if (rules.required) {
          throw new InputError(`O campo ${field} é obrigatório.`)
        }

        record[field] = null
      } else {
        const id = Number(value)

        if (!Number.isSafeInteger(id) || id < 1) {
          throw new InputError(
            `O registo selecionado para ${field} não existe.`
          )
        }

        const rows = await query(
          `SELECT id FROM ${rules.table} WHERE id = ? LIMIT 1`,
          [id]
        )

        if (!rows.length) {
          throw new InputError(
            `O registo selecionado para ${field} não existe.`
          )
        }

        record[field] = id
      }

      continue
    }

    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new InputError(`O campo ${field} é inválido.`)
    }

    const text = typeof value === 'string' ? value.trim() : ''

    if (rules.required && !text) {
      throw new InputError(`O campo ${field} é obrigatório.`)
    }

    if (text.length > (rules.max || 1000)) {
      throw new InputError(`O campo ${field} excede o limite permitido.`)
    }

    if (rules.type === 'enum' && !rules.values.includes(text)) {
      throw new InputError(`O campo ${field} tem uma opção inválida.`)
    }

    if (rules.type === 'date' && text && !isValidDate(text)) {
      throw new InputError(`O campo ${field} tem uma data inválida.`)
    }

    if (
      rules.type === 'time' &&
      text &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)
    ) {
      throw new InputError(`O campo ${field} tem uma hora inválida.`)
    }

    record[field] = text || null
  }

  if (resource.table === 'routes' && record.vehicle_id) {
    const vehicles = await query(
      'SELECT driver_id FROM vehicles WHERE id = ? LIMIT 1',
      [record.vehicle_id]
    )
    const vehicleDriverId = vehicles[0]?.driver_id
      ? Number(vehicles[0].driver_id)
      : null
    if (
      vehicleDriverId &&
      record.driver_id &&
      Number(record.driver_id) !== vehicleDriverId
    ) {
      throw new InputError(
        'O motorista da rota deve ser o motorista associado Ã  carrinha.'
      )
    }
    if (vehicleDriverId) record.driver_id = vehicleDriverId
  }

  return record
}

/*
|--------------------------------------------------------------------------
| Respostas HTTP
|--------------------------------------------------------------------------
*/

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  })

  response.end(JSON.stringify(payload))
}

async function readJson(request) {
  let body = ''

  for await (const chunk of request) {
    body += chunk

    if (body.length > 8192) {
      throw new Error('Pedido demasiado grande.')
    }
  }

  return JSON.parse(body || '{}')
}

/*
|--------------------------------------------------------------------------
| Sessões
|--------------------------------------------------------------------------
*/

function getSessionToken(request) {
  const bearerToken =
    request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearerToken) return bearerToken

  const cookies = request.headers.cookie?.split(';') || []

  const sessionCookie = cookies.find(cookie =>
    cookie.trim().startsWith('carrinha_session=')
  )

  return sessionCookie?.trim().slice('carrinha_session='.length)
}

async function getAuthenticatedUser(request) {
  const token = getSessionToken(request)

  if (!token) return null

  const rows = await query(
    `
    SELECT
      users.id,
      users.email,
      users.role,
      users.guardian_id,
      users.driver_id
    FROM sessions
    JOIN users
      ON users.id = sessions.user_id
    WHERE
      sessions.token_hash = ?
      AND sessions.expires_at > ?
    LIMIT 1
    `,
    [hashToken(token), Date.now()]
  )

  return rows[0] || null
}

async function requireAdmin(request, response) {
  const user = await getAuthenticatedUser(request)

  if (!user) {
    sendJson(response, 401, {
      message: 'Inicie sessão para continuar.'
    })

    return null
  }

  if (user.role !== 'admin') {
    sendJson(response, 403, {
      message: 'Acesso reservado ao administrador.'
    })

    return null
  }

  return user
}

/*
|--------------------------------------------------------------------------
| CRUD genérico
|--------------------------------------------------------------------------
*/

async function handleResourceRequest(request, response, url, resourceName) {
  if (!(await requireAdmin(request, response))) {
    return
  }

  const resource = resources[resourceName]

  const basePath = `/api/${resourceName}`

  const match = url.pathname.match(new RegExp(`^${basePath}/(\\d+)$`))

  if (request.method === 'GET' && url.pathname === basePath) {
    const records = await query(`${resource.select} ORDER BY ${resource.order}`)

    return sendJson(response, 200, {
      [resourceName]: records
    })
  }

  if (request.method === 'POST' && url.pathname === basePath) {
    const record = await validateResource(resource, await readJson(request))

    const fields = Object.keys(resource.fields)

    try {
      const result = await execute(
        `
        INSERT INTO ${resource.table}
        (${fields.join(', ')})
        VALUES (${fields.map(() => '?').join(', ')})
        `,
        fields.map(field => record[field])
      )

      if (resourceName === 'routes' && record.vehicle_id && record.driver_id) {
        await execute(
          'UPDATE vehicles SET driver_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [record.driver_id, record.vehicle_id]
        )
        await execute(
          'UPDATE routes SET driver_id = ?, updated_at = CURRENT_TIMESTAMP WHERE vehicle_id = ?',
          [record.driver_id, record.vehicle_id]
        )
      }

      const rows = await query(
        `
        ${resource.select}
        WHERE ${resource.table}.id = ?
        `,
        [result.insertId]
      )

      return sendJson(response, 201, {
        record: rows[0]
      })
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return sendJson(response, 409, {
          message: 'Já existe um registo com esses dados.'
        })
      }

      throw error
    }
  }

  if (match && (request.method === 'PUT' || request.method === 'DELETE')) {
    const id = Number(match[1])

    if (request.method === 'DELETE') {
      if (resourceName === 'routes') {
        const trips = await query(
          `
          SELECT id
          FROM trips
          WHERE route_id = ?
          LIMIT 1
          `,
          [id]
        )

        if (trips.length) {
          return sendJson(response, 409, {
            message:
              'Esta rota tem viagens associadas. Altere ou exclua as viagens antes de remover a rota.'
          })
        }
      }

      const result = await execute(
        `DELETE FROM ${resource.table} WHERE id = ?`,
        [id]
      )

      if (!result.affectedRows) {
        return sendJson(response, 404, {
          message: 'Registo não encontrado.'
        })
      }

      return sendJson(response, 200, {
        ok: true
      })
    }

    const record = await validateResource(resource, await readJson(request))

    const fields = Object.keys(resource.fields)

    try {
      const setClause = fields.map(field => `${field} = ?`).join(', ')

      const result = await execute(
        `
        UPDATE ${resource.table}
        SET ${setClause},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [...fields.map(field => record[field]), id]
      )

      if (resourceName === 'vehicles') {
        await execute(
          'UPDATE routes SET driver_id = ?, updated_at = CURRENT_TIMESTAMP WHERE vehicle_id = ?',
          [record.driver_id, id]
        )
      } else if (
        resourceName === 'routes' &&
        record.vehicle_id &&
        record.driver_id
      ) {
        await execute(
          'UPDATE vehicles SET driver_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [record.driver_id, record.vehicle_id]
        )
        await execute(
          'UPDATE routes SET driver_id = ?, updated_at = CURRENT_TIMESTAMP WHERE vehicle_id = ?',
          [record.driver_id, record.vehicle_id]
        )
      }

      if (!result.affectedRows) {
        return sendJson(response, 404, {
          message: 'Registo não encontrado.'
        })
      }

      const rows = await query(
        `
        ${resource.select}
        WHERE ${resource.table}.id = ?
        `,
        [id]
      )

      return sendJson(response, 200, {
        record: rows[0]
      })
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return sendJson(response, 409, {
          message: 'Já existe um registo com esses dados.'
        })
      }

      throw error
    }
  }

  return sendJson(response, 404, {
    message: 'Rota não encontrada.'
  })
}

/*
|--------------------------------------------------------------------------
| Alunos
|--------------------------------------------------------------------------
*/

function validateStudent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InputError('Os dados do aluno são inválidos.')
  }

  const fields = {
    name: 160,
    birth_date: 10,
    class_name: 80,
    pickup_address: 250,
    photo_url: 2048,
    school_name: 160,
    school_phone: 40,
    emergency_contact_name: 160,
    emergency_contact_phone: 40,
    notes: 1000
  }

  const student = {}

  for (const [field, maxLength] of Object.entries(fields)) {
    const value = input[field]

    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new InputError(`O campo ${field} é inválido.`)
    }

    student[field] = typeof value === 'string' ? value.trim() : ''

    if (student[field].length > maxLength) {
      throw new InputError(`O campo ${field} excede o limite permitido.`)
    }
  }

  if (!student.name) {
    throw new InputError('O nome do aluno é obrigatório.')
  }

  if (student.birth_date) {
    if (!isValidDate(student.birth_date)) {
      throw new InputError('A data de nascimento é inválida.')
    }
  }

  if (student.photo_url) {
    let photoUrl
    try {
      photoUrl = new URL(student.photo_url)
    } catch {
      throw new InputError('O endereço da fotografia é inválido.')
    }
    if (!['http:', 'https:'].includes(photoUrl.protocol)) {
      throw new InputError('A fotografia deve usar um endereço HTTP ou HTTPS.')
    }
  }

  const guardianId =
    input.guardian_id === '' ||
    input.guardian_id === undefined ||
    input.guardian_id === null
      ? null
      : Number(input.guardian_id)

  if (
    guardianId !== null &&
    (!Number.isSafeInteger(guardianId) || guardianId < 1)
  ) {
    throw new InputError('O encarregado selecionado é inválido.')
  }

  student.guardian_id = guardianId

  const routeId =
    input.route_id === '' ||
    input.route_id === undefined ||
    input.route_id === null
      ? null
      : Number(input.route_id)

  if (routeId !== null && (!Number.isSafeInteger(routeId) || routeId < 1)) {
    throw new InputError('A rota selecionada Ã© invÃ¡lida.')
  }

  student.route_id = routeId

  return student
}

/*
|--------------------------------------------------------------------------
| Encarregados
|--------------------------------------------------------------------------
*/

function validateGuardian(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InputError('Os dados do encarregado são inválidos.')
  }

  const fields = {
    name: 160,
    relationship: 80,
    phone: 40,
    secondary_phone: 40,
    email: 160,
    address: 250,
    notes: 1000
  }

  const guardian = {}

  for (const [field, maxLength] of Object.entries(fields)) {
    const value = input[field]

    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new InputError(`O campo ${field} é inválido.`)
    }

    guardian[field] = typeof value === 'string' ? value.trim() : ''

    if (guardian[field].length > maxLength) {
      throw new InputError(`O campo ${field} excede o limite permitido.`)
    }
  }

  if (!guardian.name) {
    throw new InputError('O nome do encarregado é obrigatório.')
  }

  if (!guardian.phone) {
    throw new InputError('O telefone do encarregado é obrigatório.')
  }

  if (guardian.email && !/^\S+@\S+\.\S+$/.test(guardian.email)) {
    throw new InputError('O e-mail do encarregado é inválido.')
  }

  return guardian
}

/*
|--------------------------------------------------------------------------
| Cookies
|--------------------------------------------------------------------------
*/

function cookieHeader(token, maxAge) {
  const production = process.env.NODE_ENV === 'production'
  const secure = production ? '; Secure' : ''
  const sameSite = production ? 'None' : 'Lax'

  return (
    `carrinha_session=${token}; ` +
    `HttpOnly; SameSite=${sameSite}; Path=/; ` +
    `Max-Age=${maxAge}${secure}`
  )
}

const nativeAppOrigins = new Set([
  'capacitor://localhost',
  'http://localhost',
  'https://localhost'
])

const corsOrigins = new Set([
  ...nativeAppOrigins,
  'http://localhost:9000',
  'http://127.0.0.1:9000',
  ...(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
])

/*
|--------------------------------------------------------------------------
| SERVIDOR
|--------------------------------------------------------------------------
*/

const server = createServer(async (request, response) => {
  try {
    const origin = request.headers.origin

    // CORS controls whether a browser can read a response, not whether it can
    // send a request. Reject cross-origin writes that carry the session cookie.
    const hasSessionCookie = (request.headers.cookie || '')
      .split(';')
      .some(cookie => cookie.trim().startsWith('carrinha_session='))
    const isWriteRequest = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)

    if (
      isWriteRequest &&
      hasSessionCookie &&
      (!origin || !corsOrigins.has(origin))
    ) {
      return sendJson(response, 403, {
        message: 'Origem não autorizada para esta operação.'
      })
    }

    if (origin && corsOrigins.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Access-Control-Allow-Credentials', 'true')
      response.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      )
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      )
      response.setHeader('Vary', 'Origin')
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      return response.end()
    }

    const url = new URL(request.url, 'http://localhost')

    if (request.method === 'GET' && url.pathname === '/health') {
      await query('SELECT 1')
      return sendJson(response, 200, { ok: true, database: 'connected' })
    }

    /*
      |--------------------------------------------------------------------------
      | LOGIN
      |--------------------------------------------------------------------------
      */

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email, password, rememberMe } = await readJson(request)

      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        password.length > 1024
      ) {
        return sendJson(response, 400, {
          message: 'Preencha o e-mail e a palavra-passe.'
        })
      }

      const now = Date.now()

      const address = request.socket.remoteAddress || 'unknown'

      const attempts = loginAttempts.get(address)

      if (attempts && attempts.resetAt > now && attempts.count >= 10) {
        return sendJson(response, 429, {
          message:
            'Demasiadas tentativas. Aguarde 15 minutos e tente novamente.'
        })
      }

      const nextAttempts =
        attempts && attempts.resetAt > now
          ? {
              count: attempts.count + 1,
              resetAt: attempts.resetAt
            }
          : {
              count: 1,
              resetAt: now + 15 * 60 * 1000
            }

      loginAttempts.set(address, nextAttempts)

      const users = await query(
        `
          SELECT
            id,
            email,
            password_hash,
            role,
            guardian_id,
            driver_id
          FROM users
          WHERE LOWER(email) = LOWER(?)
          LIMIT 1
          `,
        [email.trim()]
      )

      const user = users[0]

      const passwordMatches = await verifyPassword(
        password,
        user?.password_hash || dummyPasswordHash
      )

      if (!user || !passwordMatches) {
        return sendJson(response, 401, {
          message: 'E-mail ou palavra-passe incorretos.'
        })
      }

      const token = randomBytes(32).toString('base64url')

      const maxAge = rememberMe === true ? 30 * 24 * 60 * 60 : 12 * 60 * 60

      const expiresAt = now + maxAge * 1000

      loginAttempts.delete(address)

      await execute(
        `
          DELETE FROM sessions
          WHERE expires_at <= ?
          `,
        [now]
      )

      await execute(
        `
          INSERT INTO sessions
          (token_hash, user_id, expires_at)
          VALUES (?, ?, ?)
          `,
        [hashToken(token), user.id, expiresAt]
      )

      const result = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          guardian_id: user.guardian_id,
          driver_id: user.driver_id
        }
      }
      if (nativeAppOrigins.has(request.headers.origin)) {
        result.token = token
      }

      return sendJson(response, 200, result, {
        'Set-Cookie': cookieHeader(token, maxAge)
      })
    }

    /*
      |--------------------------------------------------------------------------
      | ME
      |--------------------------------------------------------------------------
      */

    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const session = await getAuthenticatedUser(request)

      if (!session) {
        return sendJson(response, 401, {
          message: 'Sessão expirada.'
        })
      }

      return sendJson(response, 200, {
        user: session
      })
    }

    /*
      |--------------------------------------------------------------------------
      | LOGOUT
      |--------------------------------------------------------------------------
      */

    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = getSessionToken(request)

      if (token) {
        await execute(
          `
            DELETE FROM sessions
            WHERE token_hash = ?
            `,
          [hashToken(token)]
        )
      }

      return sendJson(
        response,
        200,
        { ok: true },
        {
          'Set-Cookie': cookieHeader('', 0)
        }
      )
    }

    /*
      |--------------------------------------------------------------------------
      | VIAGENS DO MOTORISTA
      |--------------------------------------------------------------------------
      */

    if (url.pathname === '/api/driver/trips' && request.method === 'GET') {
      const user = await getAuthenticatedUser(request)

      if (!user) {
        return sendJson(response, 401, {
          message: 'Inicie sessão para continuar.'
        })
      }

      if (user.role !== 'driver' || !user.driver_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao motorista.'
        })
      }

      const driverRows = await query(
        'SELECT id, name, phone, photo_url FROM drivers WHERE id = ? LIMIT 1',
        [user.driver_id]
      )

      const tripRows = await query(
        `
          SELECT
            trips.id,
            trips.trip_date,
            trips.departure_time,
            trips.status,
            trips.started_at,
            trips.finished_at,
            trips.notes,
            routes.name AS route_name,
            routes.start_point,
            routes.end_point,
            routes.end_latitude,
            routes.end_longitude,
            vehicles.model AS vehicle_model,
            vehicles.plate AS vehicle_plate,
            vehicles.capacity AS vehicle_capacity,
            drivers.name AS driver_name,
            drivers.photo_url AS driver_photo_url,
            vehicle_locations.latitude AS latitude,
            vehicle_locations.longitude AS longitude,
            vehicle_locations.accuracy AS gps_accuracy,
            vehicle_locations.recorded_at AS gps_recorded_at,
            students.id AS student_id,
            students.name AS student_name,
            students.class_name AS student_class,
            students.pickup_address AS student_pickup_address,
            COALESCE(guardians.name, students.guardian_name) AS guardian_name,
            COALESCE(guardians.phone, students.guardian_phone) AS guardian_phone,
            trip_student_status.status AS student_status,
            trip_student_status.recorded_at AS student_status_at
          FROM trips
          JOIN routes
            ON routes.id = trips.route_id
          LEFT JOIN vehicles
            ON vehicles.id = routes.vehicle_id
          LEFT JOIN drivers
            ON drivers.id = routes.driver_id
          LEFT JOIN vehicle_locations
            ON vehicle_locations.trip_id = trips.id
          LEFT JOIN students
            ON students.route_id = routes.id
          LEFT JOIN guardians
            ON guardians.id = students.guardian_id
          LEFT JOIN trip_student_status
            ON trip_student_status.trip_id = trips.id
           AND trip_student_status.student_id = students.id
          WHERE routes.driver_id = ?
          ORDER BY
            trips.trip_date DESC,
            trips.departure_time DESC
          `,
        [user.driver_id]
      )

      const tripMap = new Map()
      for (const row of tripRows) {
        if (!tripMap.has(row.id)) {
          tripMap.set(row.id, {
            id: row.id,
            trip_date: row.trip_date,
            departure_time: row.departure_time,
            status: row.status,
            started_at: row.started_at,
            finished_at: row.finished_at,
            notes: row.notes,
            route_name: row.route_name,
            start_point: row.start_point,
            end_point: row.end_point,
            end_latitude: row.end_latitude,
            end_longitude: row.end_longitude,
            vehicle_model: row.vehicle_model,
            vehicle_plate: row.vehicle_plate,
            vehicle_capacity: row.vehicle_capacity,
            driver: {
              name: row.driver_name,
              photo_url: row.driver_photo_url
            },
            location:
              row.latitude == null
                ? null
                : {
                    latitude: row.latitude,
                    longitude: row.longitude,
                    accuracy: row.gps_accuracy,
                    recorded_at: row.gps_recorded_at
                  },
            students: [],
            reports: [],
            notifications: []
          })
        }
        if (row.student_id != null) {
          tripMap.get(row.id).students.push({
            id: row.student_id,
            name: row.student_name,
            class_name: row.student_class,
            pickup_address: row.student_pickup_address,
            guardian_name: row.guardian_name,
            guardian_phone: row.guardian_phone,
            status: row.student_status || 'awaiting_pickup',
            status_at: row.student_status_at
          })
        }
      }

      const tripIds = [...tripMap.keys()]
      if (tripIds.length) {
        const reports = await query(
          `
            SELECT trip_id, type, description, created_at
            FROM trip_reports
            WHERE trip_id IN (${tripIds.map(() => '?').join(',')})
            ORDER BY created_at DESC
            `,
          tripIds
        )
        for (const report of reports) {
          const trip = tripMap.get(report.trip_id)
          if (!trip) continue
          trip.reports.push(report)
          trip.notifications.push({
            type: 'report',
            description: report.description,
            created_at: report.created_at
          })
        }

        const attendanceEvents = await query(
          `SELECT trip_student_events.trip_id,
               trip_student_events.status AS type,
               trip_student_events.recorded_at AS created_at,
               students.name AS student_name
             FROM trip_student_events
             JOIN students ON students.id = trip_student_events.student_id
             WHERE trip_student_events.trip_id IN (${tripIds.map(() => '?').join(',')})
             ORDER BY trip_student_events.recorded_at DESC
             LIMIT 100`,
          tripIds
        )
        for (const event of attendanceEvents) {
          tripMap.get(event.trip_id)?.notifications.push(event)
        }

        const tripEvents = await query(
          `SELECT trip_events.trip_id, trip_events.type,
               trip_events.recorded_at AS created_at, routes.name AS route_name
             FROM trip_events
             JOIN trips ON trips.id = trip_events.trip_id
             JOIN routes ON routes.id = trips.route_id
             WHERE trip_events.trip_id IN (${tripIds.map(() => '?').join(',')})
             ORDER BY trip_events.recorded_at DESC`,
          tripIds
        )
        for (const event of tripEvents) {
          tripMap.get(event.trip_id)?.notifications.push(event)
        }
        for (const trip of tripMap.values()) {
          trip.notifications.sort(
            (left, right) =>
              new Date(right.created_at) - new Date(left.created_at)
          )
          trip.notifications = trip.notifications.slice(0, 20)
        }
      }

      return sendJson(response, 200, {
        driver: driverRows[0] || null,
        trips: [...tripMap.values()]
      })
    }

    const pickupPointsMatch = url.pathname.match(
      /^\/api\/driver\/trips\/(\d+)\/pickup-points$/
    )
    if (pickupPointsMatch && request.method === 'GET') {
      const user = await getAuthenticatedUser(request)
      if (!user) {
        return sendJson(response, 401, {
          message: 'Inicie sessão para continuar.'
        })
      }
      if (user.role !== 'driver' || !user.driver_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao motorista.'
        })
      }

      const tripId = Number(pickupPointsMatch[1])
      const trip = await query(
        `SELECT trips.id
           FROM trips
           JOIN routes ON routes.id = trips.route_id
           WHERE trips.id = ? AND routes.driver_id = ?
           LIMIT 1`,
        [tripId, user.driver_id]
      )
      if (!trip.length) {
        return sendJson(response, 404, {
          message: 'Viagem não encontrada para este motorista.'
        })
      }

      const points = await query(
        `SELECT students.id AS student_id,
             students.name AS student_name,
             students.pickup_address,
             guardians.latitude,
             guardians.longitude
           FROM trips
           JOIN routes ON routes.id = trips.route_id
           JOIN students ON students.route_id = routes.id
           JOIN guardians ON guardians.id = students.guardian_id
           WHERE trips.id = ?
             AND routes.driver_id = ?
             AND guardians.latitude IS NOT NULL
             AND guardians.longitude IS NOT NULL
             AND guardians.latitude BETWEEN -90 AND 90
             AND guardians.longitude BETWEEN -180 AND 180
           ORDER BY students.name`,
        [tripId, user.driver_id]
      )

      return sendJson(response, 200, {
        trip_id: tripId,
        points: points.map(point => ({
          student_id: point.student_id,
          student_name: point.student_name,
          pickup_address: point.pickup_address,
          latitude: Number(point.latitude),
          longitude: Number(point.longitude)
        }))
      })
    }

    const driverTripActionMatch = url.pathname.match(
      /^\/api\/driver\/trips\/(\d+)\/(start|finish)$/
    )
    if (driverTripActionMatch && request.method === 'POST') {
      const user = await getAuthenticatedUser(request)
      if (!user) {
        return sendJson(response, 401, {
          message: 'Inicie sessÃ£o para continuar.'
        })
      }
      if (user.role !== 'driver' || !user.driver_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao motorista.'
        })
      }
      const tripId = Number(driverTripActionMatch[1])
      const action = driverTripActionMatch[2]
      const assignedTrips = await query(
        `SELECT trips.id, trips.status
           FROM trips JOIN routes ON routes.id = trips.route_id
           WHERE trips.id = ? AND routes.driver_id = ? LIMIT 1`,
        [tripId, user.driver_id]
      )
      if (!assignedTrips.length) {
        return sendJson(response, 404, {
          message: 'Viagem nÃ£o encontrada para este motorista.'
        })
      }
      const currentStatus = assignedTrips[0].status
      if (action === 'start' && currentStatus !== 'scheduled') {
        return sendJson(response, 409, {
          message: 'SÃ³ Ã© possÃ­vel iniciar uma viagem agendada.'
        })
      }
      if (action === 'finish' && currentStatus !== 'in_progress') {
        return sendJson(response, 409, {
          message: 'A viagem precisa estar em andamento para ser finalizada.'
        })
      }
      const status = action === 'start' ? 'in_progress' : 'completed'
      const eventType = action === 'start' ? 'trip_started' : 'trip_finished'
      const timestampColumn = action === 'start' ? 'started_at' : 'finished_at'
      await execute(
        `UPDATE trips SET status = ?, ${timestampColumn} = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, tripId]
      )
      await execute('INSERT INTO trip_events (trip_id, type) VALUES (?, ?)', [
        tripId,
        eventType
      ])
      const timestamps = await query(
        'SELECT started_at, finished_at FROM trips WHERE id = ? LIMIT 1',
        [tripId]
      )
      return sendJson(response, 200, {
        ok: true,
        status,
        ...timestamps[0]
      })
    }

    const attendanceMatch = url.pathname.match(
      /^\/api\/driver\/trips\/(\d+)\/students\/(\d+)\/attendance$/
    )
    if (attendanceMatch && request.method === 'POST') {
      const user = await getAuthenticatedUser(request)
      if (!user) {
        return sendJson(response, 401, {
          message: 'Inicie sessÃ£o para continuar.'
        })
      }
      if (user.role !== 'driver' || !user.driver_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao motorista.'
        })
      }
      const tripId = Number(attendanceMatch[1])
      const studentId = Number(attendanceMatch[2])
      const { status } = await readJson(request)
      if (!['boarded', 'no_show', 'alighted'].includes(status)) {
        throw new InputError('Informe embarque, ausência ou desembarque.')
      }
      const assignedStudents = await query(
        `SELECT trips.status
           FROM trips
           JOIN routes ON routes.id = trips.route_id
           JOIN students ON students.route_id = routes.id
           WHERE trips.id = ? AND students.id = ?
             AND routes.driver_id = ? LIMIT 1`,
        [tripId, studentId, user.driver_id]
      )
      if (!assignedStudents.length) {
        return sendJson(response, 404, {
          message: 'Estudante nÃ£o pertence Ã  rota desta viagem.'
        })
      }
      if (assignedStudents[0].status !== 'in_progress') {
        return sendJson(response, 409, {
          message: 'Inicie a viagem antes de confirmar estudantes.'
        })
      }
      await execute(
        `INSERT INTO trip_student_status (trip_id, student_id, status, recorded_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE status = VALUES(status), recorded_at = VALUES(recorded_at)`,
        [tripId, studentId, status]
      )
      await execute(
        'INSERT INTO trip_student_events (trip_id, student_id, status, recorded_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [tripId, studentId, status]
      )
      return sendJson(response, 200, { ok: true, status })
    }

    const reportMatch = url.pathname.match(
      /^\/api\/driver\/trips\/(\d+)\/reports$/
    )
    if (reportMatch && request.method === 'POST') {
      const user = await getAuthenticatedUser(request)
      if (!user) {
        return sendJson(response, 401, {
          message: 'Inicie sessÃ£o para continuar.'
        })
      }
      if (user.role !== 'driver' || !user.driver_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao motorista.'
        })
      }
      const tripId = Number(reportMatch[1])
      const { type, description } = await readJson(request)
      if (!['delay', 'breakdown', 'other'].includes(type)) {
        throw new InputError('Selecione o tipo de ocorrÃªncia.')
      }
      if (
        typeof description !== 'string' ||
        !description.trim() ||
        description.length > 1000
      ) {
        throw new InputError('Descreva o problema em atÃ© 1000 caracteres.')
      }
      const assignedTrips = await query(
        `SELECT trips.status
           FROM trips JOIN routes ON routes.id = trips.route_id
           WHERE trips.id = ? AND routes.driver_id = ? LIMIT 1`,
        [tripId, user.driver_id]
      )
      if (!assignedTrips.length) {
        return sendJson(response, 404, {
          message: 'Viagem nÃ£o encontrada para este motorista.'
        })
      }
      if (assignedTrips[0].status !== 'in_progress') {
        return sendJson(response, 409, {
          message:
            'A ocorrÃªncia sÃ³ pode ser registada durante uma viagem em andamento.'
        })
      }
      await execute(
        'INSERT INTO trip_reports (trip_id, driver_id, type, description) VALUES (?, ?, ?, ?)',
        [tripId, user.driver_id, type, description.trim()]
      )
      return sendJson(response, 201, { ok: true })
    }

    /*
      |--------------------------------------------------------------------------
      | CRIAR CONTA DO MOTORISTA
      |--------------------------------------------------------------------------
      */

    const driverAccountMatch = url.pathname.match(
      /^\/api\/drivers\/(\d+)\/account$/
    )

    if (driverAccountMatch && request.method === 'POST') {
      if (!(await requireAdmin(request, response))) {
        return
      }

      const driverId = Number(driverAccountMatch[1])

      const drivers = await query(
        `
          SELECT id
          FROM drivers
          WHERE id = ?
          `,
        [driverId]
      )

      if (!drivers.length) {
        return sendJson(response, 404, {
          message: 'Motorista não encontrado.'
        })
      }

      const existing = await query(
        `
          SELECT id
          FROM users
          WHERE driver_id = ?
          LIMIT 1
          `,
        [driverId]
      )

      if (existing.length) {
        return sendJson(response, 409, {
          message: 'Este motorista já possui acesso.'
        })
      }

      const { email, password } = await readJson(request)

      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        password.length > 1024
      ) {
        throw new InputError('Informe um e-mail e uma palavra-passe válidos.')
      }

      try {
        await createAccount(email, password, 'driver', null, driverId)
      } catch (error) {
        if (error.message.includes('Já existe')) {
          return sendJson(response, 409, {
            message: error.message
          })
        }

        if (error.message.includes('pelo menos 10 caracteres')) {
          throw new InputError(error.message)
        }

        if (error.message.includes('e-mail')) {
          throw new InputError(error.message)
        }

        throw error
      }

      return sendJson(response, 201, {
        ok: true,
        email: email.trim().toLowerCase()
      })
    }

    /*
      |--------------------------------------------------------------------------
      | GPS
      |--------------------------------------------------------------------------
      */

    if (url.pathname === '/api/gps/locations' && request.method === 'GET') {
      if (!(await requireAdmin(request, response))) {
        return
      }

      const locations = await query(
        `
          SELECT
            vehicle_locations.*,
            trips.id AS trip_id,
            routes.name AS route_name,
            routes.end_point,
            routes.end_latitude,
            routes.end_longitude,
            vehicles.plate AS vehicle_plate,
            drivers.name AS driver_name
          FROM vehicle_locations
          JOIN trips
            ON trips.id =
               vehicle_locations.trip_id
          JOIN routes
            ON routes.id =
               trips.route_id
          LEFT JOIN vehicles
            ON vehicles.id =
               routes.vehicle_id
          LEFT JOIN drivers
            ON drivers.id =
               routes.driver_id
          WHERE trips.status =
                'in_progress'
          `
      )

      return sendJson(response, 200, { locations })
    }

    const gpsMatch = url.pathname.match(/^\/api\/trips\/(\d+)\/location$/)

    if (gpsMatch && request.method === 'POST') {
      const user = await getAuthenticatedUser(request)
      if (!user) {
        return sendJson(response, 401, {
          message: 'Inicie sessÃ£o para continuar.'
        })
      }
      if (user.role !== 'admin' && user.role !== 'driver') {
        return sendJson(response, 403, {
          message:
            'Apenas o motorista atribuÃ­do pode enviar esta localizaÃ§Ã£o.'
        })
      }

      const tripId = Number(gpsMatch[1])

      const trips =
        user.role === 'admin'
          ? await query(
              `SELECT id FROM trips WHERE id = ? AND status = ? LIMIT 1`,
              [tripId, 'in_progress']
            )
          : await query(
              `SELECT trips.id
               FROM trips JOIN routes ON routes.id = trips.route_id
               WHERE trips.id = ? AND trips.status = ?
                 AND routes.driver_id = ? LIMIT 1`,
              [tripId, 'in_progress', user.driver_id]
            )

      if (!trips.length) {
        return sendJson(response, 409, {
          message: 'A viagem tem de estar em andamento para receber GPS.'
        })
      }

      const { latitude, longitude, accuracy } = await readJson(request)

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new InputError('As coordenadas GPS são inválidas.')
      }

      const recordedAt = new Date().toISOString()
      const databaseRecordedAt = recordedAt.slice(0, 23).replace('T', ' ')

      /*
       * vehicle_locations.trip_id
       * é PRIMARY KEY.
       *
       * Por isso usamos ON DUPLICATE KEY
       * UPDATE no MySQL.
       */
      await execute(
        `
          INSERT INTO vehicle_locations
          (
            trip_id,
            latitude,
            longitude,
            accuracy,
            recorded_at
          )
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            latitude = VALUES(latitude),
            longitude = VALUES(longitude),
            accuracy = VALUES(accuracy),
            recorded_at = VALUES(recorded_at)
          `,
        [
          tripId,
          latitude,
          longitude,
          Number.isFinite(accuracy) ? accuracy : null,
          databaseRecordedAt
        ]
      )

      return sendJson(response, 200, {
        ok: true,
        recorded_at: recordedAt
      })
    }

    /*
      |--------------------------------------------------------------------------
      | ALUNOS DO ENCARREGADO
      |--------------------------------------------------------------------------
      */

    if (
      url.pathname === '/api/guardian/password' &&
      request.method === 'POST'
    ) {
      const user = await getAuthenticatedUser(request)
      if (!user)
        return sendJson(response, 401, {
          message: 'Inicie sessão para continuar.'
        })
      if (user.role !== 'guardian' || !user.guardian_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao encarregado.'
        })
      }
      const { current_password, new_password } = await readJson(request)
      if (
        typeof current_password !== 'string' ||
        typeof new_password !== 'string'
      ) {
        throw new InputError(
          'Informe a palavra-passe atual e a nova palavra-passe.'
        )
      }
      if (new_password.length < 10 || new_password.length > 1024) {
        throw new InputError(
          'A nova palavra-passe deve ter pelo menos 10 caracteres.'
        )
      }
      const accounts = await query(
        'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
        [user.id]
      )
      if (
        !accounts.length ||
        !(await verifyPassword(current_password, accounts[0].password_hash))
      ) {
        return sendJson(response, 400, {
          message: 'A palavra-passe atual está incorreta.'
        })
      }
      await execute('UPDATE users SET password_hash = ? WHERE id = ?', [
        await hashPassword(new_password),
        user.id
      ])
      return sendJson(response, 200, { ok: true })
    }

    if (
      url.pathname === '/api/guardians/me/location' &&
      request.method === 'PUT'
    ) {
      const user = await getAuthenticatedUser(request)
      if (!user) {
        return sendJson(response, 401, {
          message: 'Inicie sessão para continuar.'
        })
      }
      if (user.role !== 'guardian' || !user.guardian_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao encarregado.'
        })
      }

      const { latitude, longitude } = await readJson(request)
      if (
        typeof latitude !== 'number' ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        typeof longitude !== 'number' ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw new InputError(
          'Informe latitude entre -90 e 90 e longitude entre -180 e 180.'
        )
      }

      const result = await execute(
        `UPDATE guardians
           SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        [latitude, longitude, user.guardian_id]
      )

      if (!result.affectedRows) {
        const existingGuardian = await query(
          'SELECT id FROM guardians WHERE id = ? LIMIT 1',
          [user.guardian_id]
        )
        if (existingGuardian.length) {
          return sendJson(response, 200, {
            ok: true,
            location: { latitude, longitude }
          })
        }
        return sendJson(response, 404, {
          message: 'Encarregado não encontrado.'
        })
      }

      return sendJson(response, 200, {
        ok: true,
        location: { latitude, longitude }
      })
    }

    if (url.pathname === '/api/guardian/students' && request.method === 'GET') {
      const user = await getAuthenticatedUser(request)

      if (!user) {
        return sendJson(response, 401, {
          message: 'Inicie sessão para continuar.'
        })
      }

      if (user.role !== 'guardian' || !user.guardian_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao encarregado.'
        })
      }

      const students = await query(
        `
          SELECT
            students.id,
            students.name,
            students.birth_date,
            students.class_name,
            students.pickup_address,
            students.photo_url,
            students.school_name,
            students.school_phone,
            students.emergency_contact_name,
            students.emergency_contact_phone,
            routes.name AS route_name,
            routes.start_point,
            routes.end_point,
            routes.end_latitude,
            routes.end_longitude,
            trips.id AS trip_id,
            trips.status AS trip_status,
            vehicles.plate AS vehicle_plate,
            vehicle_locations.latitude,
            vehicle_locations.longitude,
            vehicle_locations.recorded_at AS location_at,
            trip_student_status.status AS attendance_status,
            trip_student_status.recorded_at AS attendance_at,
            attendance_times.boarded_at,
            attendance_times.alighted_at,
            next_trip.id AS next_trip_id,
            next_trip.trip_date AS next_trip_date,
            next_trip.departure_time AS next_trip_time
          FROM students
          LEFT JOIN routes ON routes.id = students.route_id
          LEFT JOIN trips ON trips.id = (
            SELECT candidate.id
            FROM trips AS candidate
            WHERE candidate.route_id = students.route_id
              AND candidate.status IN ('in_progress', 'completed')
            ORDER BY
              (candidate.status = 'in_progress') DESC,
              candidate.trip_date DESC,
              candidate.departure_time DESC
            LIMIT 1
          )
          LEFT JOIN vehicles ON vehicles.id = routes.vehicle_id
          LEFT JOIN vehicle_locations ON vehicle_locations.trip_id = trips.id
          LEFT JOIN trip_student_status
            ON trip_student_status.trip_id = trips.id
           AND trip_student_status.student_id = students.id
          LEFT JOIN (
            SELECT trip_id, student_id,
              MAX(CASE WHEN status = 'boarded' THEN recorded_at END) AS boarded_at,
              MAX(CASE WHEN status = 'alighted' THEN recorded_at END) AS alighted_at
            FROM trip_student_events
            GROUP BY trip_id, student_id
          ) AS attendance_times
            ON attendance_times.trip_id = trips.id
           AND attendance_times.student_id = students.id
          LEFT JOIN trips AS next_trip ON next_trip.id = (
            SELECT scheduled.id
            FROM trips AS scheduled
            WHERE scheduled.route_id = students.route_id
              AND scheduled.status = 'scheduled'
              AND scheduled.trip_date >= CURRENT_DATE
            ORDER BY scheduled.trip_date ASC, scheduled.departure_time ASC
            LIMIT 1
          )
          WHERE students.guardian_id = ?
          ORDER BY students.name
          `,
        [user.guardian_id]
      )

      const guardianRows = await query(
        `SELECT guardians.name, guardians.relationship, guardians.phone,
             guardians.secondary_phone, guardians.email, guardians.address,
             guardians.latitude, guardians.longitude,
             users.email AS account_email
           FROM guardians
           LEFT JOIN users ON users.guardian_id = guardians.id
           WHERE guardians.id = ? LIMIT 1`,
        [user.guardian_id]
      )
      const history = await query(
        `SELECT trips.id AS trip_id, students.id AS student_id,
             students.name AS student_name, routes.name AS route_name,
             trips.trip_date, trips.departure_time, trips.status AS trip_status,
             trips.started_at, trips.finished_at,
             trip_student_status.status AS attendance_status,
             trip_student_status.recorded_at AS attendance_at,
             MAX(CASE WHEN trip_student_events.status = 'boarded'
               THEN trip_student_events.recorded_at END) AS boarded_at,
             MAX(CASE WHEN trip_student_events.status = 'alighted'
               THEN trip_student_events.recorded_at END) AS alighted_at
           FROM students
           JOIN trips ON trips.route_id = students.route_id
           JOIN routes ON routes.id = trips.route_id
           LEFT JOIN trip_student_status
             ON trip_student_status.trip_id = trips.id
            AND trip_student_status.student_id = students.id
           LEFT JOIN trip_student_events
             ON trip_student_events.trip_id = trips.id
            AND trip_student_events.student_id = students.id
           WHERE students.guardian_id = ?
           GROUP BY trips.id, students.id, students.name, routes.name,
             trips.trip_date, trips.departure_time, trips.status,
             trips.started_at, trips.finished_at,
             trip_student_status.status, trip_student_status.recorded_at
           ORDER BY trips.trip_date DESC, trips.departure_time DESC
           LIMIT 40`,
        [user.guardian_id]
      )
      const events = await query(
        `SELECT trip_student_events.id, students.name AS student_name,
             trip_student_events.status AS type,
             trip_student_events.recorded_at AS created_at,
             routes.name AS route_name
           FROM trip_student_events
           JOIN students ON students.id = trip_student_events.student_id
           JOIN trips ON trips.id = trip_student_events.trip_id
           JOIN routes ON routes.id = trips.route_id
           WHERE students.guardian_id = ?
           ORDER BY trip_student_events.recorded_at DESC LIMIT 20`,
        [user.guardian_id]
      )
      const reports = await query(
        `SELECT trip_reports.id, trip_reports.type, trip_reports.description,
             trip_reports.created_at, routes.name AS route_name
           FROM trip_reports
           JOIN trips ON trips.id = trip_reports.trip_id
           JOIN routes ON routes.id = trips.route_id
           WHERE EXISTS (
             SELECT 1 FROM students
             WHERE students.route_id = trips.route_id
               AND students.guardian_id = ?
           )
           ORDER BY trip_reports.created_at DESC LIMIT 20`,
        [user.guardian_id]
      )
      const tripEvents = await query(
        `SELECT trip_events.id, trip_events.type,
             trip_events.recorded_at AS created_at,
             routes.name AS route_name
           FROM trip_events
           JOIN trips ON trips.id = trip_events.trip_id
           JOIN routes ON routes.id = trips.route_id
           WHERE EXISTS (
             SELECT 1 FROM students
             WHERE students.route_id = trips.route_id
               AND students.guardian_id = ?
           )
           ORDER BY trip_events.recorded_at DESC LIMIT 20`,
        [user.guardian_id]
      )
      const notifications = [...events, ...reports, ...tripEvents]
        .sort(
          (left, right) =>
            new Date(right.created_at) - new Date(left.created_at)
        )
        .slice(0, 30)

      return sendJson(response, 200, {
        students,
        guardian: guardianRows[0] || null,
        history,
        notifications
      })
    }

    /*
      |--------------------------------------------------------------------------
      | STUDENTS
      |--------------------------------------------------------------------------
      */

    if (url.pathname.startsWith('/api/students')) {
      if (!(await requireAdmin(request, response))) {
        return
      }

      if (request.method === 'GET' && url.pathname === '/api/students') {
        const students = await query(`
              SELECT
                students.id,
                students.name,
                students.birth_date,
                students.class_name,
                students.guardian_id,
                students.route_id,
                students.photo_url,
                students.school_name,
                students.school_phone,
                students.emergency_contact_name,
                students.emergency_contact_phone,

                COALESCE(
                  guardians.name,
                  students.guardian_name,
                  ''
                ) AS guardian_name,

                COALESCE(
                  guardians.phone,
                  students.guardian_phone,
                  ''
                ) AS guardian_phone,

                students.pickup_address,
                students.notes,
                routes.name AS route_name,
                students.created_at,
                students.updated_at

              FROM students

              LEFT JOIN guardians
                ON guardians.id =
                   students.guardian_id
              LEFT JOIN routes
                ON routes.id =
                   students.route_id

              ORDER BY students.name
            `)

        return sendJson(response, 200, { students })
      }

      if (request.method === 'POST' && url.pathname === '/api/students') {
        const student = validateStudent(await readJson(request))

        if (student.guardian_id) {
          const guardians = await query(
            `
                SELECT id
                FROM guardians
                WHERE id = ?
                `,
            [student.guardian_id]
          )

          if (!guardians.length) {
            throw new InputError('O encarregado selecionado não existe.')
          }
        }

        if (student.route_id) {
          const routes = await query('SELECT id FROM routes WHERE id = ?', [
            student.route_id
          ])
          if (!routes.length) {
            throw new InputError('A rota selecionada nÃ£o existe.')
          }
        }

        const result = await execute(
          `
              INSERT INTO students
              (
                name,
                birth_date,
                class_name,
                guardian_id,
                route_id,
                photo_url,
                school_name,
                school_phone,
                emergency_contact_name,
                emergency_contact_phone,
                pickup_address,
                notes
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
          [
            student.name,
            student.birth_date || null,
            student.class_name || null,
            student.guardian_id,
            student.route_id,
            student.photo_url || null,
            student.school_name || null,
            student.school_phone || null,
            student.emergency_contact_name || null,
            student.emergency_contact_phone || null,
            student.pickup_address || null,
            student.notes || null
          ]
        )

        const created = await query(
          `
              SELECT
                students.*,
                guardians.name AS guardian_name,
                guardians.phone AS guardian_phone,
                routes.name AS route_name
              FROM students
              LEFT JOIN guardians
                ON guardians.id =
                   students.guardian_id
              LEFT JOIN routes
                ON routes.id =
                   students.route_id
              WHERE students.id = ?
              `,
          [result.insertId]
        )

        return sendJson(response, 201, {
          student: created[0]
        })
      }

      const studentMatch = url.pathname.match(/^\/api\/students\/(\d+)$/)

      if (
        studentMatch &&
        (request.method === 'PUT' || request.method === 'DELETE')
      ) {
        const id = Number(studentMatch[1])

        if (request.method === 'DELETE') {
          const result = await execute(
            `
                DELETE FROM students
                WHERE id = ?
                `,
            [id]
          )

          if (!result.affectedRows) {
            return sendJson(response, 404, {
              message: 'Aluno não encontrado.'
            })
          }

          return sendJson(response, 200, { ok: true })
        }

        const student = validateStudent(await readJson(request))

        if (student.guardian_id) {
          const guardians = await query(
            `
                SELECT id
                FROM guardians
                WHERE id = ?
                `,
            [student.guardian_id]
          )

          if (!guardians.length) {
            throw new InputError('O encarregado selecionado não existe.')
          }
        }

        if (student.route_id) {
          const routes = await query('SELECT id FROM routes WHERE id = ?', [
            student.route_id
          ])
          if (!routes.length) {
            throw new InputError('A rota selecionada nÃ£o existe.')
          }
        }

        const result = await execute(
          `
              UPDATE students
              SET
                name = ?,
                birth_date = ?,
                class_name = ?,
                guardian_id = ?,
                route_id = ?,
                photo_url = ?,
                school_name = ?,
                school_phone = ?,
                emergency_contact_name = ?,
                emergency_contact_phone = ?,
                guardian_name = NULL,
                guardian_phone = NULL,
                pickup_address = ?,
                notes = ?,
                updated_at =
                  CURRENT_TIMESTAMP
              WHERE id = ?
              `,
          [
            student.name,
            student.birth_date || null,
            student.class_name || null,
            student.guardian_id,
            student.route_id,
            student.photo_url || null,
            student.school_name || null,
            student.school_phone || null,
            student.emergency_contact_name || null,
            student.emergency_contact_phone || null,
            student.pickup_address || null,
            student.notes || null,
            id
          ]
        )

        if (!result.affectedRows) {
          return sendJson(response, 404, {
            message: 'Aluno não encontrado.'
          })
        }

        const updated = await query(
          `
              SELECT
                students.*,
                guardians.name AS guardian_name,
                guardians.phone AS guardian_phone,
                routes.name AS route_name
              FROM students
              LEFT JOIN guardians
                ON guardians.id =
                   students.guardian_id
              LEFT JOIN routes
                ON routes.id =
                   students.route_id
              WHERE students.id = ?
              `,
          [id]
        )

        return sendJson(response, 200, {
          student: updated[0]
        })
      }
    }

    /*
      |--------------------------------------------------------------------------
      | ENCARREGADOS
      |--------------------------------------------------------------------------
      */

    if (url.pathname.startsWith('/api/guardians')) {
      if (!(await requireAdmin(request, response))) {
        return
      }

      if (request.method === 'GET' && url.pathname === '/api/guardians') {
        const guardians = await query(`
              SELECT
                guardians.*,

                COUNT(
                  students.id
                ) AS student_count,

                EXISTS (
                  SELECT 1
                  FROM users
                  WHERE users.guardian_id =
                        guardians.id
                ) AS has_account

              FROM guardians

              LEFT JOIN students
                ON students.guardian_id =
                   guardians.id

              GROUP BY guardians.id

              ORDER BY guardians.name
            `)

        return sendJson(response, 200, { guardians })
      }

      if (request.method === 'POST' && url.pathname === '/api/guardians') {
        const guardian = validateGuardian(await readJson(request))

        const result = await execute(
          `
              INSERT INTO guardians
              (
                name,
                relationship,
                phone,
                secondary_phone,
                email,
                address,
                notes
              )
              VALUES (?, ?, ?, ?, ?, ?, ?)
              `,
          [
            guardian.name,
            guardian.relationship || null,
            guardian.phone,
            guardian.secondary_phone || null,
            guardian.email || null,
            guardian.address || null,
            guardian.notes || null
          ]
        )

        const created = await query(
          `
              SELECT *
              FROM guardians
              WHERE id = ?
              `,
          [result.insertId]
        )

        return sendJson(response, 201, {
          guardian: created[0]
        })
      }

      const accountMatch = url.pathname.match(
        /^\/api\/guardians\/(\d+)\/account$/
      )

      if (accountMatch && request.method === 'POST') {
        const id = Number(accountMatch[1])

        const guardians = await query(
          `
              SELECT id, email
              FROM guardians
              WHERE id = ?
              `,
          [id]
        )

        const guardian = guardians[0]

        if (!guardian) {
          return sendJson(response, 404, {
            message: 'Encarregado não encontrado.'
          })
        }

        if (!guardian.email) {
          return sendJson(response, 400, {
            message:
              'Cadastre um e-mail para o encarregado antes de criar o acesso.'
          })
        }

        const existing = await query(
          `
              SELECT id
              FROM users
              WHERE guardian_id = ?
              LIMIT 1
              `,
          [id]
        )

        if (existing.length) {
          return sendJson(response, 409, {
            message: 'Este encarregado já possui acesso.'
          })
        }

        const { password } = await readJson(request)

        if (typeof password !== 'string' || password.length > 1024) {
          throw new InputError('Informe uma palavra-passe inicial válida.')
        }

        try {
          await createAccount(guardian.email, password, 'guardian', id)
        } catch (error) {
          if (error.message.includes('Já existe')) {
            return sendJson(response, 409, {
              message: error.message
            })
          }

          if (error.message.includes('pelo menos 10 caracteres')) {
            throw new InputError(error.message)
          }

          throw error
        }

        return sendJson(response, 201, {
          ok: true,
          email: guardian.email
        })
      }

      const guardianMatch = url.pathname.match(/^\/api\/guardians\/(\d+)$/)

      if (
        guardianMatch &&
        (request.method === 'PUT' || request.method === 'DELETE')
      ) {
        const id = Number(guardianMatch[1])

        if (request.method === 'DELETE') {
          const result = await execute(
            `
                DELETE FROM guardians
                WHERE id = ?
                `,
            [id]
          )

          if (!result.affectedRows) {
            return sendJson(response, 404, {
              message: 'Encarregado não encontrado.'
            })
          }

          return sendJson(response, 200, { ok: true })
        }

        const guardian = validateGuardian(await readJson(request))

        const account = await query(
          `
              SELECT id
              FROM users
              WHERE guardian_id = ?
              LIMIT 1
              `,
          [id]
        )

        if (account.length && !guardian.email) {
          return sendJson(response, 400, {
            message:
              'O e-mail é obrigatório enquanto existir uma conta associada.'
          })
        }

        try {
          await execute(
            `
              UPDATE users
              SET email = ?
              WHERE guardian_id = ?
              `,
            [guardian.email || null, id]
          )
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') {
            return sendJson(response, 409, {
              message: 'Já existe uma conta com esse e-mail.'
            })
          }

          throw error
        }

        const result = await execute(
          `
              UPDATE guardians
              SET
                name = ?,
                relationship = ?,
                phone = ?,
                secondary_phone = ?,
                email = ?,
                address = ?,
                notes = ?,
                updated_at =
                  CURRENT_TIMESTAMP
              WHERE id = ?
              `,
          [
            guardian.name,
            guardian.relationship || null,
            guardian.phone,
            guardian.secondary_phone || null,
            guardian.email || null,
            guardian.address || null,
            guardian.notes || null,
            id
          ]
        )

        if (!result.affectedRows) {
          return sendJson(response, 404, {
            message: 'Encarregado não encontrado.'
          })
        }

        const updated = await query(
          `
              SELECT *
              FROM guardians
              WHERE id = ?
              `,
          [id]
        )

        return sendJson(response, 200, {
          guardian: updated[0]
        })
      }
    }

    /*
      |--------------------------------------------------------------------------
      | RELATÓRIO
      |--------------------------------------------------------------------------
      */

    if (url.pathname === '/api/reports/overview' && request.method === 'GET') {
      if (!(await requireAdmin(request, response))) {
        return
      }

      const reportDate =
        url.searchParams.get('date') || new Date().toISOString().slice(0, 10)

      if (!isValidDate(reportDate)) {
        throw new InputError('A data do relatório é inválida.')
      }

      const count = async table => {
        const rows = await query(`SELECT COUNT(*) AS total FROM ${table}`)

        return Number(rows[0].total)
      }

      const todayTrips = await query(
        `
            SELECT
              trips.id,
              trips.trip_date,
              trips.departure_time,
              trips.status,
              routes.name AS route_name,
              routes.start_point,
              routes.end_point,
              vehicles.plate AS vehicle_plate,
              drivers.name AS driver_name

            FROM trips

            JOIN routes
              ON routes.id =
                 trips.route_id

            LEFT JOIN vehicles
              ON vehicles.id =
                 routes.vehicle_id

            LEFT JOIN drivers
              ON drivers.id =
                 routes.driver_id

            WHERE trips.trip_date = ?

            ORDER BY trips.departure_time
            `,
        [reportDate]
      )

      const incidents = await query(
        `
          SELECT
            trip_reports.id,
            trip_reports.type,
            trip_reports.description,
            trip_reports.created_at,
            trips.id AS trip_id,
            routes.name AS route_name,
            drivers.name AS driver_name
          FROM trip_reports
          JOIN trips ON trips.id = trip_reports.trip_id
          JOIN routes ON routes.id = trips.route_id
          LEFT JOIN drivers ON drivers.id = trip_reports.driver_id
          WHERE trips.trip_date = ?
          ORDER BY trip_reports.created_at DESC
          `,
        [reportDate]
      )

      return sendJson(response, 200, {
        date: reportDate,

        summary: {
          students: await count('students'),

          guardians: await count('guardians'),

          drivers: await count('drivers'),

          vehicles: await count('vehicles'),

          routes: await count('routes'),

          trips_today: todayTrips.length,

          completed_today: todayTrips.filter(
            trip => trip.status === 'completed'
          ).length
        },

        today_trips: todayTrips,

        incidents
      })
    }

    /*
      |--------------------------------------------------------------------------
      | CRUD GENÉRICO
      |--------------------------------------------------------------------------
      */

    for (const resourceName of Object.keys(resources)) {
      if (
        url.pathname === `/api/${resourceName}` ||
        url.pathname.startsWith(`/api/${resourceName}/`)
      ) {
        return await handleResourceRequest(request, response, url, resourceName)
      }
    }

    return sendJson(response, 404, {
      message: 'Rota não encontrada.'
    })
  } catch (error) {
    console.error('Erro no servidor:', error)

    const status =
      error instanceof SyntaxError || error instanceof InputError ? 400 : 500

    return sendJson(response, status, {
      message:
        status === 400
          ? error.message || 'Pedido inválido.'
          : 'Erro interno do servidor.'
    })
  }
})

/*
|--------------------------------------------------------------------------
| Inicialização
|--------------------------------------------------------------------------
*/

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT || process.env.AUTH_PORT || 3001)

  server.listen(port, '0.0.0.0', () => {
    console.log(`Servidor de autenticação disponível na porta ${port}.`)
    console.log('Banco de dados: MySQL')
    console.log(`Base de dados: ${process.env.DB_NAME || 'carrinha_escolar'}`)
  })
}
