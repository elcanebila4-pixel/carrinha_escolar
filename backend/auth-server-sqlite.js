import { createServer } from 'node:http'
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const scrypt = promisify(scryptCallback)
const loginAttempts = new Map()

class InputError extends Error {}
const databasePath = resolve(process.env.AUTH_DB_PATH || 'data/carrinha.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })

const db = new DatabaseSync(databasePath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    guardian_id INTEGER REFERENCES guardians(id) ON DELETE CASCADE,
    driver_id INTEGER REFERENCES drivers(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guardians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    relationship TEXT,
    phone TEXT NOT NULL,
    secondary_phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    license_number TEXT NOT NULL,
    license_expiry TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT NOT NULL UNIQUE COLLATE NOCASE,
    model TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    year INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_point TEXT NOT NULL,
    end_point TEXT NOT NULL,
    end_latitude REAL,
    end_longitude REAL,
    departure_time TEXT,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    trip_date TEXT NOT NULL,
    departure_time TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS vehicle_locations (
    trip_id INTEGER PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    recorded_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    birth_date TEXT,
    class_name TEXT,
    guardian_name TEXT,
    guardian_phone TEXT,
    pickup_address TEXT,
    notes TEXT,
    guardian_id INTEGER REFERENCES guardians(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const userColumns = db
  .prepare('PRAGMA table_info(users)')
  .all()
  .map(column => column.name)
if (!userColumns.includes('role'))
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'")
if (!userColumns.includes('guardian_id'))
  db.exec(
    'ALTER TABLE users ADD COLUMN guardian_id INTEGER REFERENCES guardians(id) ON DELETE CASCADE'
  )
if (!userColumns.includes('driver_id'))
  db.exec(
    'ALTER TABLE users ADD COLUMN driver_id INTEGER REFERENCES drivers(id) ON DELETE CASCADE'
  )
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS users_guardian_unique ON users(guardian_id) WHERE guardian_id IS NOT NULL'
)
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS users_driver_unique ON users(driver_id) WHERE driver_id IS NOT NULL'
)

const routeColumns = db
  .prepare('PRAGMA table_info(routes)')
  .all()
  .map(column => column.name)
if (!routeColumns.includes('end_latitude'))
  db.exec('ALTER TABLE routes ADD COLUMN end_latitude REAL')
if (!routeColumns.includes('end_longitude'))
  db.exec('ALTER TABLE routes ADD COLUMN end_longitude REAL')

const studentColumns = db
  .prepare('PRAGMA table_info(students)')
  .all()
  .map(column => column.name)
if (!studentColumns.includes('guardian_id')) {
  db.exec(
    'ALTER TABLE students ADD COLUMN guardian_id INTEGER REFERENCES guardians(id) ON DELETE SET NULL'
  )
}

const legacyStudents = db
  .prepare(`
  SELECT id, guardian_name, guardian_phone FROM students
  WHERE guardian_id IS NULL AND TRIM(COALESCE(guardian_name, '')) <> ''
`)
  .all()
for (const student of legacyStudents) {
  let guardian = db
    .prepare(`
    SELECT id FROM guardians
    WHERE name = ? COLLATE NOCASE AND COALESCE(phone, '') = COALESCE(?, '')
  `)
    .get(student.guardian_name.trim(), student.guardian_phone?.trim() || '')
  if (!guardian) {
    const created = db
      .prepare('INSERT INTO guardians (name, phone) VALUES (?, ?)')
      .run(student.guardian_name.trim(), student.guardian_phone?.trim() || '')
    guardian = { id: Number(created.lastInsertRowid) }
  }
  db.prepare(
    'UPDATE students SET guardian_id = ?, guardian_name = NULL, guardian_phone = NULL WHERE id = ?'
  ).run(guardian.id, student.id)
}

const hashToken = token => createHash('sha256').update(token).digest('hex')

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = await scrypt(password, salt, 64)
  return `${salt}:${derivedKey.toString('hex')}`
}

async function verifyPassword(password, storedHash) {
  const [salt, storedKey] = storedHash.split(':')
  const actualKey = await scrypt(password, salt, 64)
  const expectedKey = Buffer.from(storedKey, 'hex')
  return (
    actualKey.length === expectedKey.length &&
    timingSafeEqual(actualKey, expectedKey)
  )
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
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail))
    throw new Error('Informe um e-mail válido.')
  if (password.length < 10)
    throw new Error('A palavra-passe deve ter pelo menos 10 caracteres.')

  const passwordHash = await hashPassword(password)
  try {
    db.prepare(
      'INSERT INTO users (email, password_hash, role, guardian_id, driver_id) VALUES (?, ?, ?, ?, ?)'
    ).run(normalizedEmail, passwordHash, role, guardianId, driverId)
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE')
      throw new Error('Já existe uma conta com esse e-mail.')
    throw error
  }
}

const resources = {
  drivers: {
    table: 'drivers',
    select: `SELECT drivers.*,
      EXISTS (SELECT 1 FROM users WHERE users.driver_id = drivers.id) AS has_account
      FROM drivers`,
    order: 'drivers.name COLLATE NOCASE',
    fields: {
      name: { type: 'text', required: true, max: 160 },
      phone: { type: 'text', required: true, max: 40 },
      license_number: { type: 'text', required: true, max: 80 },
      license_expiry: { type: 'date', max: 10 },
      notes: { type: 'text', max: 1000 }
    }
  },
  vehicles: {
    table: 'vehicles',
    select: 'SELECT vehicles.* FROM vehicles',
    order: 'vehicles.plate COLLATE NOCASE',
    fields: {
      plate: { type: 'text', required: true, max: 30 },
      model: { type: 'text', required: true, max: 100 },
      capacity: { type: 'integer', required: true, min: 1, max: 100 },
      year: { type: 'integer', min: 1950, max: new Date().getFullYear() + 1 },
      status: {
        type: 'enum',
        required: true,
        values: ['active', 'maintenance']
      },
      notes: { type: 'text', max: 1000 }
    }
  },
  routes: {
    table: 'routes',
    select: `SELECT routes.*, vehicles.plate AS vehicle_plate, drivers.name AS driver_name
      FROM routes LEFT JOIN vehicles ON vehicles.id = routes.vehicle_id
      LEFT JOIN drivers ON drivers.id = routes.driver_id`,
    order: 'routes.name COLLATE NOCASE',
    fields: {
      name: { type: 'text', required: true, max: 120 },
      start_point: { type: 'text', required: true, max: 180 },
      end_point: { type: 'text', required: true, max: 180 },
      end_latitude: { type: 'number', min: -90, max: 90 },
      end_longitude: { type: 'number', min: -180, max: 180 },
      departure_time: { type: 'time', max: 5 },
      vehicle_id: { type: 'foreign', table: 'vehicles' },
      driver_id: { type: 'foreign', table: 'drivers' },
      notes: { type: 'text', max: 1000 }
    }
  },
  trips: {
    table: 'trips',
    select: `SELECT trips.*, routes.name AS route_name, routes.start_point, routes.end_point,
      routes.vehicle_id, vehicles.plate AS vehicle_plate, routes.driver_id, drivers.name AS driver_name
      FROM trips JOIN routes ON routes.id = trips.route_id
      LEFT JOIN vehicles ON vehicles.id = routes.vehicle_id
      LEFT JOIN drivers ON drivers.id = routes.driver_id`,
    order: 'trips.trip_date DESC, trips.departure_time DESC',
    fields: {
      route_id: { type: 'foreign', required: true, table: 'routes' },
      trip_date: { type: 'date', required: true, max: 10 },
      departure_time: { type: 'time', max: 5 },
      status: {
        type: 'enum',
        required: true,
        values: ['scheduled', 'in_progress', 'completed', 'cancelled']
      },
      notes: { type: 'text', max: 1000 }
    }
  }
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

function validateResource(resource, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new InputError('Os dados enviados são inválidos.')
  const record = {}
  for (const [field, rules] of Object.entries(resource.fields)) {
    const value = input[field]
    if (rules.type === 'number') {
      if (value === '' || value === undefined || value === null)
        record[field] = null
      else {
        const number = Number(value)
        if (
          !Number.isFinite(number) ||
          number < rules.min ||
          number > rules.max
        )
          throw new InputError(`O campo ${field} tem um valor inválido.`)
        record[field] = number
      }
      continue
    }
    if (rules.type === 'integer') {
      if (value === '' || value === undefined || value === null) {
        if (rules.required)
          throw new InputError(`O campo ${field} é obrigatório.`)
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
        if (rules.required)
          throw new InputError(`O campo ${field} é obrigatório.`)
        record[field] = null
      } else {
        const id = Number(value)
        if (
          !Number.isSafeInteger(id) ||
          id < 1 ||
          !db.prepare(`SELECT id FROM ${rules.table} WHERE id = ?`).get(id)
        ) {
          throw new InputError(
            `O registo selecionado para ${field} não existe.`
          )
        }
        record[field] = id
      }
      continue
    }
    if (value !== undefined && value !== null && typeof value !== 'string')
      throw new InputError(`O campo ${field} é inválido.`)
    const text = typeof value === 'string' ? value.trim() : ''
    if (rules.required && !text)
      throw new InputError(`O campo ${field} é obrigatório.`)
    if (text.length > (rules.max || 1000))
      throw new InputError(`O campo ${field} excede o limite permitido.`)
    if (rules.type === 'enum' && !rules.values.includes(text))
      throw new InputError(`O campo ${field} tem uma opção inválida.`)
    if (rules.type === 'date' && text && !isValidDate(text))
      throw new InputError(`O campo ${field} tem uma data inválida.`)
    if (
      rules.type === 'time' &&
      text &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)
    )
      throw new InputError(`O campo ${field} tem uma hora inválida.`)
    record[field] = text
  }
  return record
}

async function handleResourceRequest(request, response, url, resourceName) {
  if (!requireAdmin(request, response)) return
  const resource = resources[resourceName]
  const basePath = `/api/${resourceName}`
  const match = url.pathname.match(new RegExp(`^${basePath}/(\\d+)$`))

  if (request.method === 'GET' && url.pathname === basePath) {
    const records = db
      .prepare(`${resource.select} ORDER BY ${resource.order}`)
      .all()
    return sendJson(response, 200, { [resourceName]: records })
  }
  if (request.method === 'POST' && url.pathname === basePath) {
    const record = validateResource(resource, await readJson(request))
    const fields = Object.keys(resource.fields)
    try {
      const result = db
        .prepare(
          `INSERT INTO ${resource.table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`
        )
        .run(...fields.map(field => record[field]))
      const row = db
        .prepare(`${resource.select} WHERE ${resource.table}.id = ?`)
        .get(Number(result.lastInsertRowid))
      return sendJson(response, 201, { record: row })
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed'))
        return sendJson(response, 409, {
          message: 'Já existe um registo com esses dados.'
        })
      throw error
    }
  }
  if (match && (request.method === 'PUT' || request.method === 'DELETE')) {
    const id = Number(match[1])
    if (request.method === 'DELETE') {
      if (
        resourceName === 'routes' &&
        db.prepare('SELECT 1 FROM trips WHERE route_id = ? LIMIT 1').get(id)
      ) {
        return sendJson(response, 409, {
          message:
            'Esta rota tem viagens associadas. Altere ou exclua as viagens antes de remover a rota.'
        })
      }
      const result = db
        .prepare(`DELETE FROM ${resource.table} WHERE id = ?`)
        .run(id)
      if (!result.changes)
        return sendJson(response, 404, { message: 'Registo não encontrado.' })
      return sendJson(response, 200, { ok: true })
    }
    const record = validateResource(resource, await readJson(request))
    const fields = Object.keys(resource.fields)
    try {
      const result = db
        .prepare(
          `UPDATE ${resource.table} SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        )
        .run(...fields.map(field => record[field]), id)
      if (!result.changes)
        return sendJson(response, 404, { message: 'Registo não encontrado.' })
      const row = db
        .prepare(`${resource.select} WHERE ${resource.table}.id = ?`)
        .get(id)
      return sendJson(response, 200, { record: row })
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed'))
        return sendJson(response, 409, {
          message: 'Já existe um registo com esses dados.'
        })
      throw error
    }
  }
  return sendJson(response, 404, { message: 'Rota não encontrada.' })
}

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
    if (body.length > 8192) throw new Error('Pedido demasiado grande.')
  }
  return JSON.parse(body || '{}')
}

function getSessionToken(request) {
  const cookies = request.headers.cookie?.split(';') || []
  const sessionCookie = cookies.find(cookie =>
    cookie.trim().startsWith('carrinha_session=')
  )
  return sessionCookie?.trim().slice('carrinha_session='.length)
}

function getAuthenticatedUser(request) {
  const token = getSessionToken(request)
  if (!token) return null
  return (
    db
      .prepare(`
    SELECT users.id, users.email, users.role, users.guardian_id, users.driver_id FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `)
      .get(hashToken(token), Date.now()) || null
  )
}

function requireAdmin(request, response) {
  const user = getAuthenticatedUser(request)
  if (!user) {
    sendJson(response, 401, { message: 'Inicie sessão para continuar.' })
    return null
  }
  if (user.role !== 'admin') {
    sendJson(response, 403, { message: 'Acesso reservado ao administrador.' })
    return null
  }
  return user
}

function validateStudent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InputError('Os dados do aluno são inválidos.')
  }
  const fields = {
    name: 160,
    birth_date: 10,
    class_name: 80,
    pickup_address: 250,
    notes: 1000
  }
  const student = {}
  for (const [field, maxLength] of Object.entries(fields)) {
    const value = input[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new InputError(`O campo ${field} é inválido.`)
    }
    student[field] = typeof value === 'string' ? value.trim() : ''
    if (student[field].length > maxLength)
      throw new InputError(`O campo ${field} excede o limite permitido.`)
  }
  if (!student.name) throw new InputError('O nome do aluno é obrigatório.')
  if (student.birth_date) {
    const birthDate = new Date(`${student.birth_date}T00:00:00.000Z`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(student.birth_date) ||
      Number.isNaN(birthDate.getTime()) ||
      birthDate.toISOString().slice(0, 10) !== student.birth_date
    ) {
      throw new InputError('A data de nascimento é inválida.')
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
  return student
}

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
    if (guardian[field].length > maxLength)
      throw new InputError(`O campo ${field} excede o limite permitido.`)
  }
  if (!guardian.name)
    throw new InputError('O nome do encarregado é obrigatório.')
  if (!guardian.phone)
    throw new InputError('O telefone do encarregado é obrigatório.')
  if (guardian.email && !/^\S+@\S+\.\S+$/.test(guardian.email))
    throw new InputError('O e-mail do encarregado é inválido.')
  return guardian
}

function cookieHeader(token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `carrinha_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')

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
          ? { count: attempts.count + 1, resetAt: attempts.resetAt }
          : { count: 1, resetAt: now + 15 * 60 * 1000 }
      loginAttempts.set(address, nextAttempts)

      const user = db
        .prepare(
          'SELECT id, email, password_hash, role, guardian_id, driver_id FROM users WHERE email = ? COLLATE NOCASE'
        )
        .get(email.trim())
      const passwordMatches = await verifyPassword(
        password,
        user?.password_hash || dummyPasswordHash
      )
      if (!user || !passwordMatches)
        return sendJson(response, 401, {
          message: 'E-mail ou palavra-passe incorretos.'
        })

      const token = randomBytes(32).toString('base64url')
      const maxAge = rememberMe === true ? 30 * 24 * 60 * 60 : 12 * 60 * 60
      const expiresAt = now + maxAge * 1000
      loginAttempts.delete(address)
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
      db.prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'
      ).run(hashToken(token), user.id, expiresAt)
      return sendJson(
        response,
        200,
        {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            guardian_id: user.guardian_id,
            driver_id: user.driver_id
          }
        },
        { 'Set-Cookie': cookieHeader(token, maxAge) }
      )
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const session = getAuthenticatedUser(request)
      if (!session)
        return sendJson(response, 401, { message: 'Sessão expirada.' })
      return sendJson(response, 200, { user: session })
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = getSessionToken(request)
      if (token)
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
          hashToken(token)
        )
      return sendJson(
        response,
        200,
        { ok: true },
        { 'Set-Cookie': cookieHeader('', 0) }
      )
    }

    if (url.pathname === '/api/driver/trips' && request.method === 'GET') {
      const user = getAuthenticatedUser(request)
      if (!user)
        return sendJson(response, 401, { message: 'Inicie sessÃ£o para continuar.' })
      if (user.role !== 'driver' || !user.driver_id)
        return sendJson(response, 403, { message: 'Acesso reservado ao motorista.' })
      const trips = db.prepare(`
        SELECT trips.id, trips.trip_date, trips.departure_time, trips.status, trips.notes,
          routes.name AS route_name, routes.start_point, routes.end_point,
          vehicles.plate AS vehicle_plate
        FROM trips JOIN routes ON routes.id = trips.route_id
        LEFT JOIN vehicles ON vehicles.id = routes.vehicle_id
        WHERE routes.driver_id = ?
        ORDER BY trips.trip_date DESC, trips.departure_time DESC
      `).all(user.driver_id)
      return sendJson(response, 200, { trips })
    }

    const driverAccountMatch = url.pathname.match(/^\/api\/drivers\/(\d+)\/account$/)
    if (driverAccountMatch && request.method === 'POST') {
      if (!requireAdmin(request, response)) return
      const driverId = Number(driverAccountMatch[1])
      const driver = db.prepare('SELECT id FROM drivers WHERE id = ?').get(driverId)
      if (!driver)
        return sendJson(response, 404, { message: 'Motorista nÃ£o encontrado.' })
      if (db.prepare('SELECT id FROM users WHERE driver_id = ?').get(driverId))
        return sendJson(response, 409, { message: 'Este motorista jÃ¡ possui acesso.' })
      const { email, password } = await readJson(request)
      if (typeof email !== 'string' || typeof password !== 'string' || password.length > 1024)
        throw new InputError('Informe um e-mail e uma palavra-passe vÃ¡lidos.')
      try {
        await createAccount(email, password, 'driver', null, driverId)
      } catch (error) {
        if (error.message.includes('JÃ¡ existe'))
          return sendJson(response, 409, { message: error.message })
        if (error.message.includes('pelo menos 10 caracteres'))
          throw new InputError(error.message)
        if (error.message.includes('e-mail')) throw new InputError(error.message)
        throw error
      }
      return sendJson(response, 201, { ok: true, email: email.trim().toLowerCase() })
    }

    if (url.pathname === '/api/gps/locations' && request.method === 'GET') {
      if (!requireAdmin(request, response)) return
      const locations = db
        .prepare(`
        SELECT vehicle_locations.*, trips.id AS trip_id, routes.name AS route_name,
          routes.end_point, routes.end_latitude, routes.end_longitude,
          vehicles.plate AS vehicle_plate, drivers.name AS driver_name
        FROM vehicle_locations JOIN trips ON trips.id = vehicle_locations.trip_id
        JOIN routes ON routes.id = trips.route_id
        LEFT JOIN vehicles ON vehicles.id = routes.vehicle_id
        LEFT JOIN drivers ON drivers.id = routes.driver_id
        WHERE trips.status = 'in_progress'
      `)
        .all()
      return sendJson(response, 200, { locations })
    }
    const gpsMatch = url.pathname.match(/^\/api\/trips\/(\d+)\/location$/)
    if (gpsMatch && request.method === 'POST') {
      if (!requireAdmin(request, response)) return
      const tripId = Number(gpsMatch[1])
      const trip = db
        .prepare('SELECT id FROM trips WHERE id = ? AND status = ?')
        .get(tripId, 'in_progress')
      if (!trip)
        return sendJson(response, 409, {
          message: 'A viagem tem de estar em andamento para receber GPS.'
        })
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
      db.prepare(`INSERT INTO vehicle_locations (trip_id, latitude, longitude, accuracy, recorded_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(trip_id) DO UPDATE SET latitude = excluded.latitude,
        longitude = excluded.longitude, accuracy = excluded.accuracy, recorded_at = excluded.recorded_at`).run(
        tripId,
        latitude,
        longitude,
        Number.isFinite(accuracy) ? accuracy : null,
        recordedAt
      )
      return sendJson(response, 200, { ok: true, recorded_at: recordedAt })
    }

    if (url.pathname === '/api/guardian/students' && request.method === 'GET') {
      const user = getAuthenticatedUser(request)
      if (!user)
        return sendJson(response, 401, {
          message: 'Inicie sessão para continuar.'
        })
      if (user.role !== 'guardian' || !user.guardian_id) {
        return sendJson(response, 403, {
          message: 'Acesso reservado ao encarregado.'
        })
      }
      const students = db
        .prepare(`
        SELECT id, name, birth_date, class_name, pickup_address
        FROM students WHERE guardian_id = ? ORDER BY name COLLATE NOCASE
      `)
        .all(user.guardian_id)
      return sendJson(response, 200, { students })
    }

    if (url.pathname.startsWith('/api/students')) {
      if (!requireAdmin(request, response)) return

      if (request.method === 'GET' && url.pathname === '/api/students') {
        const students = db
          .prepare(`
          SELECT students.id, students.name, students.birth_date, students.class_name,
            students.guardian_id, COALESCE(guardians.name, students.guardian_name, '') AS guardian_name,
            COALESCE(guardians.phone, students.guardian_phone, '') AS guardian_phone,
            students.pickup_address, students.notes, students.created_at, students.updated_at
          FROM students LEFT JOIN guardians ON guardians.id = students.guardian_id
          ORDER BY students.name COLLATE NOCASE
        `)
          .all()
        return sendJson(response, 200, { students })
      }

      if (request.method === 'POST' && url.pathname === '/api/students') {
        const student = validateStudent(await readJson(request))
        if (
          student.guardian_id &&
          !db
            .prepare('SELECT id FROM guardians WHERE id = ?')
            .get(student.guardian_id)
        ) {
          throw new InputError('O encarregado selecionado não existe.')
        }
        const result = db
          .prepare(`
          INSERT INTO students (name, birth_date, class_name, guardian_id, pickup_address, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
          .run(
            student.name,
            student.birth_date,
            student.class_name,
            student.guardian_id,
            student.pickup_address,
            student.notes
          )
        const created = db
          .prepare(`
          SELECT students.*, guardians.name AS guardian_name, guardians.phone AS guardian_phone
          FROM students LEFT JOIN guardians ON guardians.id = students.guardian_id WHERE students.id = ?
        `)
          .get(Number(result.lastInsertRowid))
        return sendJson(response, 201, { student: created })
      }

      const studentMatch = url.pathname.match(/^\/api\/students\/(\d+)$/)
      if (
        studentMatch &&
        (request.method === 'PUT' || request.method === 'DELETE')
      ) {
        const id = Number(studentMatch[1])
        if (request.method === 'DELETE') {
          const result = db.prepare('DELETE FROM students WHERE id = ?').run(id)
          if (!result.changes)
            return sendJson(response, 404, { message: 'Aluno não encontrado.' })
          return sendJson(response, 200, { ok: true })
        }

        const student = validateStudent(await readJson(request))
        if (
          student.guardian_id &&
          !db
            .prepare('SELECT id FROM guardians WHERE id = ?')
            .get(student.guardian_id)
        ) {
          throw new InputError('O encarregado selecionado não existe.')
        }
        const result = db
          .prepare(`
          UPDATE students SET name = ?, birth_date = ?, class_name = ?, guardian_id = ?, guardian_name = NULL,
            guardian_phone = NULL, pickup_address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
          .run(
            student.name,
            student.birth_date,
            student.class_name,
            student.guardian_id,
            student.pickup_address,
            student.notes,
            id
          )
        if (!result.changes)
          return sendJson(response, 404, { message: 'Aluno não encontrado.' })
        const updated = db
          .prepare(`
          SELECT students.*, guardians.name AS guardian_name, guardians.phone AS guardian_phone
          FROM students LEFT JOIN guardians ON guardians.id = students.guardian_id WHERE students.id = ?
        `)
          .get(id)
        return sendJson(response, 200, { student: updated })
      }
    }

    if (url.pathname.startsWith('/api/guardians')) {
      if (!requireAdmin(request, response)) return

      if (request.method === 'GET' && url.pathname === '/api/guardians') {
        const guardians = db
          .prepare(`
          SELECT guardians.*, COUNT(students.id) AS student_count,
            EXISTS (SELECT 1 FROM users WHERE users.guardian_id = guardians.id) AS has_account
          FROM guardians LEFT JOIN students ON students.guardian_id = guardians.id
          GROUP BY guardians.id ORDER BY guardians.name COLLATE NOCASE
        `)
          .all()
        return sendJson(response, 200, { guardians })
      }

      if (request.method === 'POST' && url.pathname === '/api/guardians') {
        const guardian = validateGuardian(await readJson(request))
        const result = db
          .prepare(`
          INSERT INTO guardians (name, relationship, phone, secondary_phone, email, address, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
          .run(
            guardian.name,
            guardian.relationship,
            guardian.phone,
            guardian.secondary_phone,
            guardian.email,
            guardian.address,
            guardian.notes
          )
        const created = db
          .prepare('SELECT * FROM guardians WHERE id = ?')
          .get(Number(result.lastInsertRowid))
        return sendJson(response, 201, { guardian: created })
      }

      const accountMatch = url.pathname.match(
        /^\/api\/guardians\/(\d+)\/account$/
      )
      if (accountMatch && request.method === 'POST') {
        const id = Number(accountMatch[1])
        const guardian = db
          .prepare('SELECT id, email FROM guardians WHERE id = ?')
          .get(id)
        if (!guardian)
          return sendJson(response, 404, {
            message: 'Encarregado não encontrado.'
          })
        if (!guardian.email)
          return sendJson(response, 400, {
            message:
              'Cadastre um e-mail para o encarregado antes de criar o acesso.'
          })
        if (db.prepare('SELECT id FROM users WHERE guardian_id = ?').get(id))
          return sendJson(response, 409, {
            message: 'Este encarregado já possui acesso.'
          })

        const { password } = await readJson(request)
        if (typeof password !== 'string' || password.length > 1024)
          throw new InputError('Informe uma palavra-passe inicial válida.')
        try {
          await createAccount(guardian.email, password, 'guardian', id)
        } catch (error) {
          if (error.message.includes('Já existe'))
            return sendJson(response, 409, { message: error.message })
          if (error.message.includes('pelo menos 10 caracteres'))
            throw new InputError(error.message)
          throw error
        }
        return sendJson(response, 201, { ok: true, email: guardian.email })
      }

      const guardianMatch = url.pathname.match(/^\/api\/guardians\/(\d+)$/)
      if (
        guardianMatch &&
        (request.method === 'PUT' || request.method === 'DELETE')
      ) {
        const id = Number(guardianMatch[1])
        if (request.method === 'DELETE') {
          const result = db
            .prepare('DELETE FROM guardians WHERE id = ?')
            .run(id)
          if (!result.changes)
            return sendJson(response, 404, {
              message: 'Encarregado não encontrado.'
            })
          return sendJson(response, 200, { ok: true })
        }

        const guardian = validateGuardian(await readJson(request))
        const hasAccount = db
          .prepare('SELECT id FROM users WHERE guardian_id = ?')
          .get(id)
        if (hasAccount && !guardian.email)
          return sendJson(response, 400, {
            message:
              'O e-mail é obrigatório enquanto existir uma conta associada.'
          })
        try {
          db.prepare('UPDATE users SET email = ? WHERE guardian_id = ?').run(
            guardian.email,
            id
          )
        } catch (error) {
          if (error.message.includes('UNIQUE constraint failed'))
            return sendJson(response, 409, {
              message: 'Já existe uma conta com esse e-mail.'
            })
          throw error
        }
        const result = db
          .prepare(`
          UPDATE guardians SET name = ?, relationship = ?, phone = ?, secondary_phone = ?, email = ?, address = ?,
            notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `)
          .run(
            guardian.name,
            guardian.relationship,
            guardian.phone,
            guardian.secondary_phone,
            guardian.email,
            guardian.address,
            guardian.notes,
            id
          )
        if (!result.changes)
          return sendJson(response, 404, {
            message: 'Encarregado não encontrado.'
          })
        const updated = db
          .prepare('SELECT * FROM guardians WHERE id = ?')
          .get(id)
        return sendJson(response, 200, { guardian: updated })
      }
    }

    if (url.pathname === '/api/reports/overview' && request.method === 'GET') {
      if (!requireAdmin(request, response)) return
      const reportDate =
        url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
      if (!isValidDate(reportDate))
        throw new InputError('A data do relatório é inválida.')
      const count = table =>
        db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total
      const todayTrips = db
        .prepare(`
        SELECT trips.id, trips.trip_date, trips.departure_time, trips.status,
          routes.name AS route_name, routes.start_point, routes.end_point, vehicles.plate AS vehicle_plate,
          drivers.name AS driver_name
        FROM trips JOIN routes ON routes.id = trips.route_id
        LEFT JOIN vehicles ON vehicles.id = routes.vehicle_id
        LEFT JOIN drivers ON drivers.id = routes.driver_id
        WHERE trips.trip_date = ?
        ORDER BY trips.departure_time
      `)
        .all(reportDate)
      return sendJson(response, 200, {
        date: reportDate,
        summary: {
          students: count('students'),
          guardians: count('guardians'),
          drivers: count('drivers'),
          vehicles: count('vehicles'),
          routes: count('routes'),
          trips_today: todayTrips.length,
          completed_today: todayTrips.filter(
            trip => trip.status === 'completed'
          ).length
        },
        today_trips: todayTrips
      })
    }

    for (const resourceName of Object.keys(resources)) {
      if (
        url.pathname === `/api/${resourceName}` ||
        url.pathname.startsWith(`/api/${resourceName}/`)
      ) {
        return await handleResourceRequest(request, response, url, resourceName)
      }
    }

    return sendJson(response, 404, { message: 'Rota não encontrada.' })
  } catch (error) {
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.AUTH_PORT || 3001)
  server.listen(port, '127.0.0.1', () =>
    console.log(`Servidor de autenticação disponível na porta ${port}.`)
  )
}
