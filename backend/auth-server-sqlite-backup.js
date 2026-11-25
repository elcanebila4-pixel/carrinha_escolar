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

const hashToken = token =>
  createHash('sha256').update(token).digest('hex')

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params)
  return result
}

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

const dummyPasswordHash = await hashPassword(
  randomBytes(32).toString('hex')
)

export async function createAccount(
  email,
  password,
  role = 'admin',
  guardianId = null,
  driverId = null
) {
  const normalizedEmail = email.trim().toLowerCase()

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw new Error('Informe um e-mail válido.')
  }

  if (password.length < 10) {
    throw new Error(
      'A palavra-passe deve ter pelo menos 10 caracteres.'
    )
  }

  const passwordHash = await hashPassword(password)

  try {
    await execute(
      `INSERT INTO users
       (email, password_hash, role, guardian_id, driver_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        normalizedEmail,
        passwordHash,
        role,
        guardianId,
        driverId
      ]
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

      notes: {
        type: 'text',
        max: 1000
      }
    }
  },

  vehicles: {
    table: 'vehicles',

    select: `
      SELECT vehicles.*
      FROM vehicles
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
        values: [
          'scheduled',
          'in_progress',
          'completed',
          'cancelled'
        ]
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
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  )
}

async function validateResource(resource, input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new InputError('Os dados enviados são inválidos.')
  }

  const record = {}

  for (const [field, rules] of Object.entries(resource.fields)) {
    const value = input[field]

    if (rules.type === 'number') {
      if (
        value === '' ||
        value === undefined ||
        value === null
      ) {
        record[field] = null
      } else {
        const number = Number(value)

        if (
          !Number.isFinite(number) ||
          number < rules.min ||
          number > rules.max
        ) {
          throw new InputError(
            `O campo ${field} tem um valor inválido.`
          )
        }

        record[field] = number
      }

      continue
    }

    if (rules.type === 'integer') {
      if (
        value === '' ||
        value === undefined ||
        value === null
      ) {
        if (rules.required) {
          throw new InputError(
            `O campo ${field} é obrigatório.`
          )
        }

        record[field] = null
      } else {
        const number = Number(value)

        if (
          !Number.isSafeInteger(number) ||
          number < rules.min ||
          number > rules.max
        ) {
          throw new InputError(
            `O campo ${field} tem um valor inválido.`
          )
        }

        record[field] = number
      }

      continue
    }

    if (rules.type === 'foreign') {
      if (
        value === '' ||
        value === undefined ||
        value === null
      ) {
        if (rules.required) {
          throw new InputError(
            `O campo ${field} é obrigatório.`
          )
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

    if (
      value !== undefined &&
      value !== null &&
      typeof value !== 'string'
    ) {
      throw new InputError(
        `O campo ${field} é inválido.`
      )
    }

    const text =
      typeof value === 'string'
        ? value.trim()
        : ''

    if (rules.required && !text) {
      throw new InputError(
        `O campo ${field} é obrigatório.`
      )
    }

    if (text.length > (rules.max || 1000)) {
      throw new InputError(
        `O campo ${field} excede o limite permitido.`
      )
    }

    if (
      rules.type === 'enum' &&
      !rules.values.includes(text)
    ) {
      throw new InputError(
        `O campo ${field} tem uma opção inválida.`
      )
    }

    if (
      rules.type === 'date' &&
      text &&
      !isValidDate(text)
    ) {
      throw new InputError(
        `O campo ${field} tem uma data inválida.`
      )
    }

    if (
      rules.type === 'time' &&
      text &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)
    ) {
      throw new InputError(
        `O campo ${field} tem uma hora inválida.`
      )
    }

    record[field] = text || null
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
  const cookies =
    request.headers.cookie?.split(';') || []

  const sessionCookie = cookies.find(cookie =>
    cookie.trim().startsWith('carrinha_session=')
  )

  return sessionCookie
    ?.trim()
    .slice('carrinha_session='.length)
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
    [
      hashToken(token),
      Date.now()
    ]
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

async function handleResourceRequest(
  request,
  response,
  url,
  resourceName
) {
  if (!(await requireAdmin(request, response))) {
    return
  }

  const resource = resources[resourceName]

  const basePath = `/api/${resourceName}`

  const match = url.pathname.match(
    new RegExp(`^${basePath}/(\\d+)$`)
  )

  if (
    request.method === 'GET' &&
    url.pathname === basePath
  ) {
    const records = await query(
      `${resource.select} ORDER BY ${resource.order}`
    )

    return sendJson(response, 200, {
      [resourceName]: records
    })
  }

  if (
    request.method === 'POST' &&
    url.pathname === basePath
  ) {
    const record = await validateResource(
      resource,
      await readJson(request)
    )

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
          message:
            'Já existe um registo com esses dados.'
        })
      }

      throw error
    }
  }

  if (
    match &&
    (request.method === 'PUT' ||
      request.method === 'DELETE')
  ) {
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

    const record = await validateResource(
      resource,
      await readJson(request)
    )

    const fields = Object.keys(resource.fields)

    try {
      const setClause = fields
        .map(field => `${field} = ?`)
        .join(', ')

      const result = await execute(
        `
        UPDATE ${resource.table}
        SET ${setClause},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [
          ...fields.map(field => record[field]),
          id
        ]
      )

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
          message:
            'Já existe um registo com esses dados.'
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
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new InputError(
      'Os dados do aluno são inválidos.'
    )
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

    if (
      value !== undefined &&
      value !== null &&
      typeof value !== 'string'
    ) {
      throw new InputError(
        `O campo ${field} é inválido.`
      )
    }

    student[field] =
      typeof value === 'string'
        ? value.trim()
        : ''

    if (student[field].length > maxLength) {
      throw new InputError(
        `O campo ${field} excede o limite permitido.`
      )
    }
  }

  if (!student.name) {
    throw new InputError(
      'O nome do aluno é obrigatório.'
    )
  }

  if (student.birth_date) {
    if (!isValidDate(student.birth_date)) {
      throw new InputError(
        'A data de nascimento é inválida.'
      )
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
    (!Number.isSafeInteger(guardianId) ||
      guardianId < 1)
  ) {
    throw new InputError(
      'O encarregado selecionado é inválido.'
    )
  }

  student.guardian_id = guardianId

  return student
}

/*
|--------------------------------------------------------------------------
| Encarregados
|--------------------------------------------------------------------------
*/

function validateGuardian(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new InputError(
      'Os dados do encarregado são inválidos.'
    )
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

    if (
      value !== undefined &&
      value !== null &&
      typeof value !== 'string'
    ) {
      throw new InputError(
        `O campo ${field} é inválido.`
      )
    }

    guardian[field] =
      typeof value === 'string'
        ? value.trim()
        : ''

    if (guardian[field].length > maxLength) {
      throw new InputError(
        `O campo ${field} excede o limite permitido.`
      )
    }
  }

  if (!guardian.name) {
    throw new InputError(
      'O nome do encarregado é obrigatório.'
    )
  }

  if (!guardian.phone) {
    throw new InputError(
      'O telefone do encarregado é obrigatório.'
    )
  }

  if (
    guardian.email &&
    !/^\S+@\S+\.\S+$/.test(guardian.email)
  ) {
    throw new InputError(
      'O e-mail do encarregado é inválido.'
    )
  }

  return guardian
}

/*
|--------------------------------------------------------------------------
| Cookies
|--------------------------------------------------------------------------
*/

function cookieHeader(token, maxAge) {
  const secure =
    process.env.NODE_ENV === 'production'
      ? '; Secure'
      : ''

  return (
    `carrinha_session=${token}; ` +
    `HttpOnly; SameSite=Lax; Path=/; ` +
    `Max-Age=${maxAge}${secure}`
  )
}

/*
|--------------------------------------------------------------------------
| SERVIDOR
|--------------------------------------------------------------------------
*/

const server = createServer(
  async (request, response) => {
    try {
      const url = new URL(
        request.url,
        'http://localhost'
      )

      /*
      |--------------------------------------------------------------------------
      | LOGIN
      |--------------------------------------------------------------------------
      */

      if (
        request.method === 'POST' &&
        url.pathname === '/api/auth/login'
      ) {
        const {
          email,
          password,
          rememberMe
        } = await readJson(request)

        if (
          typeof email !== 'string' ||
          typeof password !== 'string' ||
          password.length > 1024
        ) {
          return sendJson(response, 400, {
            message:
              'Preencha o e-mail e a palavra-passe.'
          })
        }

        const now = Date.now()

        const address =
          request.socket.remoteAddress ||
          'unknown'

        const attempts =
          loginAttempts.get(address)

        if (
          attempts &&
          attempts.resetAt > now &&
          attempts.count >= 10
        ) {
          return sendJson(response, 429, {
            message:
              'Demasiadas tentativas. Aguarde 15 minutos e tente novamente.'
          })
        }

        const nextAttempts =
          attempts &&
          attempts.resetAt > now
            ? {
                count: attempts.count + 1,
                resetAt: attempts.resetAt
              }
            : {
                count: 1,
                resetAt:
                  now + 15 * 60 * 1000
              }

        loginAttempts.set(
          address,
          nextAttempts
        )

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

        const passwordMatches =
          await verifyPassword(
            password,
            user?.password_hash ||
              dummyPasswordHash
          )

        if (!user || !passwordMatches) {
          return sendJson(response, 401, {
            message:
              'E-mail ou palavra-passe incorretos.'
          })
        }

        const token =
          randomBytes(32).toString(
            'base64url'
          )

        const maxAge =
          rememberMe === true
            ? 30 * 24 * 60 * 60
            : 12 * 60 * 60

        const expiresAt =
          now + maxAge * 1000

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
          [
            hashToken(token),
            user.id,
            expiresAt
          ]
        )

        return sendJson(
          response,
          200,
          {
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
              guardian_id:
                user.guardian_id,
              driver_id:
                user.driver_id
            }
          },
          {
            'Set-Cookie':
              cookieHeader(
                token,
                maxAge
              )
          }
        )
      }

      /*
      |--------------------------------------------------------------------------
      | ME
      |--------------------------------------------------------------------------
      */

      if (
        request.method === 'GET' &&
        url.pathname === '/api/auth/me'
      ) {
        const session =
          await getAuthenticatedUser(
            request
          )

        if (!session) {
          return sendJson(
            response,
            401,
            {
              message:
                'Sessão expirada.'
            }
          )
        }

        return sendJson(
          response,
          200,
          {
            user: session
          }
        )
      }

      /*
      |--------------------------------------------------------------------------
      | LOGOUT
      |--------------------------------------------------------------------------
      */

      if (
        request.method === 'POST' &&
        url.pathname === '/api/auth/logout'
      ) {
        const token =
          getSessionToken(request)

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
            'Set-Cookie':
              cookieHeader('', 0)
          }
        )
      }

      /*
      |--------------------------------------------------------------------------
      | VIAGENS DO MOTORISTA
      |--------------------------------------------------------------------------
      */

      if (
        url.pathname ===
          '/api/driver/trips' &&
        request.method === 'GET'
      ) {
        const user =
          await getAuthenticatedUser(
            request
          )

        if (!user) {
          return sendJson(
            response,
            401,
            {
              message:
                'Inicie sessão para continuar.'
            }
          )
        }

        if (
          user.role !== 'driver' ||
          !user.driver_id
        ) {
          return sendJson(
            response,
            403,
            {
              message:
                'Acesso reservado ao motorista.'
            }
          )
        }

        const trips = await query(
          `
          SELECT
            trips.id,
            trips.trip_date,
            trips.departure_time,
            trips.status,
            trips.notes,
            routes.name AS route_name,
            routes.start_point,
            routes.end_point,
            vehicles.plate AS vehicle_plate
          FROM trips
          JOIN routes
            ON routes.id = trips.route_id
          LEFT JOIN vehicles
            ON vehicles.id = routes.vehicle_id
          WHERE routes.driver_id = ?
          ORDER BY
            trips.trip_date DESC,
            trips.departure_time DESC
          `,
          [user.driver_id]
        )

        return sendJson(
          response,
          200,
          { trips }
        )
      }

      /*
      |--------------------------------------------------------------------------
      | CRIAR CONTA DO MOTORISTA
      |--------------------------------------------------------------------------
      */

      const driverAccountMatch =
        url.pathname.match(
          /^\/api\/drivers\/(\d+)\/account$/
        )

      if (
        driverAccountMatch &&
        request.method === 'POST'
      ) {
        if (
          !(await requireAdmin(
            request,
            response
          ))
        ) {
          return
        }

        const driverId = Number(
          driverAccountMatch[1]
        )

        const drivers = await query(
          `
          SELECT id
          FROM drivers
          WHERE id = ?
          `,
          [driverId]
        )

        if (!drivers.length) {
          return sendJson(
            response,
            404,
            {
              message:
                'Motorista não encontrado.'
            }
          )
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
          return sendJson(
            response,
            409,
            {
              message:
                'Este motorista já possui acesso.'
            }
          )
        }

        const {
          email,
          password
        } = await readJson(request)

        if (
          typeof email !== 'string' ||
          typeof password !== 'string' ||
          password.length > 1024
        ) {
          throw new InputError(
            'Informe um e-mail e uma palavra-passe válidos.'
          )
        }

        try {
          await createAccount(
            email,
            password,
            'driver',
            null,
            driverId
          )
        } catch (error) {
          if (
            error.message.includes(
              'Já existe'
            )
          ) {
            return sendJson(
              response,
              409,
              {
                message:
                  error.message
              }
            )
          }

          if (
            error.message.includes(
              'pelo menos 10 caracteres'
            )
          ) {
            throw new InputError(
              error.message
            )
          }

          if (
            error.message.includes(
              'e-mail'
            )
          ) {
            throw new InputError(
              error.message
            )
          }

          throw error
        }

        return sendJson(
          response,
          201,
          {
            ok: true,
            email:
              email.trim().toLowerCase()
          }
        )
      }

      /*
      |--------------------------------------------------------------------------
      | GPS
      |--------------------------------------------------------------------------
      */

      if (
        url.pathname ===
          '/api/gps/locations' &&
        request.method === 'GET'
      ) {
        if (
          !(await requireAdmin(
            request,
            response
          ))
        ) {
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

        return sendJson(
          response,
          200,
          { locations }
        )
      }

      const gpsMatch =
        url.pathname.match(
          /^\/api\/trips\/(\d+)\/location$/
        )

      if (
        gpsMatch &&
        request.method === 'POST'
      ) {
        if (
          !(await requireAdmin(
            request,
            response
          ))
        ) {
          return
        }

        const tripId = Number(
          gpsMatch[1]
        )

        const trips = await query(
          `
          SELECT id
          FROM trips
          WHERE id = ?
            AND status = ?
          LIMIT 1
          `,
          [tripId, 'in_progress']
        )

        if (!trips.length) {
          return sendJson(
            response,
            409,
            {
              message:
                'A viagem tem de estar em andamento para receber GPS.'
            }
          )
        }

        const {
          latitude,
          longitude,
          accuracy
        } = await readJson(request)

        if (
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90 ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          throw new InputError(
            'As coordenadas GPS são inválidas.'
          )
        }

        const recordedAt =
          new Date().toISOString()

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
            Number.isFinite(accuracy)
              ? accuracy
              : null,
            recordedAt
          ]
        )

        return sendJson(
          response,
          200,
          {
            ok: true,
            recorded_at: recordedAt
          }
        )
      }

      /*
      |--------------------------------------------------------------------------
      | ALUNOS DO ENCARREGADO
      |--------------------------------------------------------------------------
      */

      if (
        url.pathname ===
          '/api/guardian/students' &&
        request.method === 'GET'
      ) {
        const user =
          await getAuthenticatedUser(
            request
          )

        if (!user) {
          return sendJson(
            response,
            401,
            {
              message:
                'Inicie sessão para continuar.'
            }
          )
        }

        if (
          user.role !== 'guardian' ||
          !user.guardian_id
        ) {
          return sendJson(
            response,
            403,
            {
              message:
                'Acesso reservado ao encarregado.'
            }
          )
        }

        const students = await query(
          `
          SELECT
            id,
            name,
            birth_date,
            class_name,
            pickup_address
          FROM students
          WHERE guardian_id = ?
          ORDER BY name
          `,
          [user.guardian_id]
        )

        return sendJson(
          response,
          200,
          { students }
        )
      }

      /*
      |--------------------------------------------------------------------------
      | STUDENTS
      |--------------------------------------------------------------------------
      */

      if (
        url.pathname.startsWith(
          '/api/students'
        )
      ) {
        if (
          !(await requireAdmin(
            request,
            response
          ))
        ) {
          return
        }

        if (
          request.method === 'GET' &&
          url.pathname === '/api/students'
        ) {
          const students =
            await query(`
              SELECT
                students.id,
                students.name,
                students.birth_date,
                students.class_name,
                students.guardian_id,

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
                students.created_at,
                students.updated_at

              FROM students

              LEFT JOIN guardians
                ON guardians.id =
                   students.guardian_id

              ORDER BY students.name
            `)

          return sendJson(
            response,
            200,
            { students }
          )
        }

        if (
          request.method === 'POST' &&
          url.pathname === '/api/students'
        ) {
          const student =
            validateStudent(
              await readJson(request)
            )

          if (student.guardian_id) {
            const guardians =
              await query(
                `
                SELECT id
                FROM guardians
                WHERE id = ?
                `,
                [student.guardian_id]
              )

            if (!guardians.length) {
              throw new InputError(
                'O encarregado selecionado não existe.'
              )
            }
          }

          const result =
            await execute(
              `
              INSERT INTO students
              (
                name,
                birth_date,
                class_name,
                guardian_id,
                pickup_address,
                notes
              )
              VALUES (?, ?, ?, ?, ?, ?)
              `,
              [
                student.name,
                student.birth_date || null,
                student.class_name || null,
                student.guardian_id,
                student.pickup_address || null,
                student.notes || null
              ]
            )

          const created =
            await query(
              `
              SELECT
                students.*,
                guardians.name AS guardian_name,
                guardians.phone AS guardian_phone
              FROM students
              LEFT JOIN guardians
                ON guardians.id =
                   students.guardian_id
              WHERE students.id = ?
              `,
              [result.insertId]
            )

          return sendJson(
            response,
            201,
            {
              student: created[0]
            }
          )
        }

        const studentMatch =
          url.pathname.match(
            /^\/api\/students\/(\d+)$/
          )

        if (
          studentMatch &&
          (
            request.method === 'PUT' ||
            request.method === 'DELETE'
          )
        ) {
          const id = Number(
            studentMatch[1]
          )

          if (
            request.method === 'DELETE'
          ) {
            const result =
              await execute(
                `
                DELETE FROM students
                WHERE id = ?
                `,
                [id]
              )

            if (!result.affectedRows) {
              return sendJson(
                response,
                404,
                {
                  message:
                    'Aluno não encontrado.'
                }
              )
            }

            return sendJson(
              response,
              200,
              { ok: true }
            )
          }

          const student =
            validateStudent(
              await readJson(request)
            )

          if (student.guardian_id) {
            const guardians =
              await query(
                `
                SELECT id
                FROM guardians
                WHERE id = ?
                `,
                [student.guardian_id]
              )

            if (!guardians.length) {
              throw new InputError(
                'O encarregado selecionado não existe.'
              )
            }
          }

          const result =
            await execute(
              `
              UPDATE students
              SET
                name = ?,
                birth_date = ?,
                class_name = ?,
                guardian_id = ?,
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
                student.pickup_address || null,
                student.notes || null,
                id
              ]
            )

          if (!result.affectedRows) {
            return sendJson(
              response,
              404,
              {
                message:
                  'Aluno não encontrado.'
              }
            )
          }

          const updated =
            await query(
              `
              SELECT
                students.*,
                guardians.name AS guardian_name,
                guardians.phone AS guardian_phone
              FROM students
              LEFT JOIN guardians
                ON guardians.id =
                   students.guardian_id
              WHERE students.id = ?
              `,
              [id]
            )

          return sendJson(
            response,
            200,
            {
              student: updated[0]
            }
          )
        }
      }

      /*
      |--------------------------------------------------------------------------
      | ENCARREGADOS
      |--------------------------------------------------------------------------
      */

      if (
        url.pathname.startsWith(
          '/api/guardians'
        )
      ) {
        if (
          !(await requireAdmin(
            request,
            response
          ))
        ) {
          return
        }

        if (
          request.method === 'GET' &&
          url.pathname === '/api/guardians'
        ) {
          const guardians =
            await query(`
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

          return sendJson(
            response,
            200,
            { guardians }
          )
        }

        if (
          request.method === 'POST' &&
          url.pathname === '/api/guardians'
        ) {
          const guardian =
            validateGuardian(
              await readJson(request)
            )

          const result =
            await execute(
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

          const created =
            await query(
              `
              SELECT *
              FROM guardians
              WHERE id = ?
              `,
              [result.insertId]
            )

          return sendJson(
            response,
            201,
            {
              guardian: created[0]
            }
          )
        }

        const accountMatch =
          url.pathname.match(
            /^\/api\/guardians\/(\d+)\/account$/
          )

        if (
          accountMatch &&
          request.method === 'POST'
        ) {
          const id = Number(
            accountMatch[1]
          )

          const guardians =
            await query(
              `
              SELECT id, email
              FROM guardians
              WHERE id = ?
              `,
              [id]
            )

          const guardian = guardians[0]

          if (!guardian) {
            return sendJson(
              response,
              404,
              {
                message:
                  'Encarregado não encontrado.'
              }
            )
          }

          if (!guardian.email) {
            return sendJson(
              response,
              400,
              {
                message:
                  'Cadastre um e-mail para o encarregado antes de criar o acesso.'
              }
            )
          }

          const existing =
            await query(
              `
              SELECT id
              FROM users
              WHERE guardian_id = ?
              LIMIT 1
              `,
              [id]
            )

          if (existing.length) {
            return sendJson(
              response,
              409,
              {
                message:
                  'Este encarregado já possui acesso.'
              }
            )
          }

          const { password } =
            await readJson(request)

          if (
            typeof password !== 'string' ||
            password.length > 1024
          ) {
            throw new InputError(
              'Informe uma palavra-passe inicial válida.'
            )
          }

          try {
            await createAccount(
              guardian.email,
              password,
              'guardian',
              id
            )
          } catch (error) {
            if (
              error.message.includes(
                'Já existe'
              )
            ) {
              return sendJson(
                response,
                409,
                {
                  message:
                    error.message
                }
              )
            }

            if (
              error.message.includes(
                'pelo menos 10 caracteres'
              )
            ) {
              throw new InputError(
                error.message
              )
            }

            throw error
          }

          return sendJson(
            response,
            201,
            {
              ok: true,
              email: guardian.email
            }
          )
        }

        const guardianMatch =
          url.pathname.match(
            /^\/api\/guardians\/(\d+)$/
          )

        if (
          guardianMatch &&
          (
            request.method === 'PUT' ||
            request.method === 'DELETE'
          )
        ) {
          const id = Number(
            guardianMatch[1]
          )

          if (
            request.method === 'DELETE'
          ) {
            const result =
              await execute(
                `
                DELETE FROM guardians
                WHERE id = ?
                `,
                [id]
              )

            if (!result.affectedRows) {
              return sendJson(
                response,
                404,
                {
                  message:
                    'Encarregado não encontrado.'
                }
              )
            }

            return sendJson(
              response,
              200,
              { ok: true }
            )
          }

          const guardian =
            validateGuardian(
              await readJson(request)
            )

          const account =
            await query(
              `
              SELECT id
              FROM users
              WHERE guardian_id = ?
              LIMIT 1
              `,
              [id]
            )

          if (
            account.length &&
            !guardian.email
          ) {
            return sendJson(
              response,
              400,
              {
                message:
                  'O e-mail é obrigatório enquanto existir uma conta associada.'
              }
            )
          }

          try {
            await execute(
              `
              UPDATE users
              SET email = ?
              WHERE guardian_id = ?
              `,
              [
                guardian.email || null,
                id
              ]
            )
          } catch (error) {
            if (
              error.code === 'ER_DUP_ENTRY'
            ) {
              return sendJson(
                response,
                409,
                {
                  message:
                    'Já existe uma conta com esse e-mail.'
                }
              )
            }

            throw error
          }

          const result =
            await execute(
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
            return sendJson(
              response,
              404,
              {
                message:
                  'Encarregado não encontrado.'
              }
            )
          }

          const updated =
            await query(
              `
              SELECT *
              FROM guardians
              WHERE id = ?
              `,
              [id]
            )

          return sendJson(
            response,
            200,
            {
              guardian: updated[0]
            }
          )
        }
      }

      /*
      |--------------------------------------------------------------------------
      | RELATÓRIO
      |--------------------------------------------------------------------------
      */

      if (
        url.pathname ===
          '/api/reports/overview' &&
        request.method === 'GET'
      ) {
        if (
          !(await requireAdmin(
            request,
            response
          ))
        ) {
          return
        }

        const reportDate =
          url.searchParams.get('date') ||
          new Date()
            .toISOString()
            .slice(0, 10)

        if (!isValidDate(reportDate)) {
          throw new InputError(
            'A data do relatório é inválida.'
          )
        }

        const count = async table => {
          const rows = await query(
            `SELECT COUNT(*) AS total FROM ${table}`
          )

          return Number(rows[0].total)
        }

        const todayTrips =
          await query(
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

        return sendJson(
          response,
          200,
          {
            date: reportDate,

            summary: {
              students:
                await count('students'),

              guardians:
                await count('guardians'),

              drivers:
                await count('drivers'),

              vehicles:
                await count('vehicles'),

              routes:
                await count('routes'),

              trips_today:
                todayTrips.length,

              completed_today:
                todayTrips.filter(
                  trip =>
                    trip.status ===
                    'completed'
                ).length
            },

            today_trips:
              todayTrips
          }
        )
      }

      /*
      |--------------------------------------------------------------------------
      | CRUD GENÉRICO
      |--------------------------------------------------------------------------
      */

      for (
        const resourceName of
        Object.keys(resources)
      ) {
        if (
          url.pathname ===
            `/api/${resourceName}` ||
          url.pathname.startsWith(
            `/api/${resourceName}/`
          )
        ) {
          return await handleResourceRequest(
            request,
            response,
            url,
            resourceName
          )
        }
      }

      return sendJson(
        response,
        404,
        {
          message:
            'Rota não encontrada.'
        }
      )
    } catch (error) {
      console.error(
        'Erro no servidor:',
        error
      )

      const status =
        error instanceof SyntaxError ||
        error instanceof InputError
          ? 400
          : 500

      return sendJson(
        response,
        status,
        {
          message:
            status === 400
              ? error.message ||
                'Pedido inválido.'
              : 'Erro interno do servidor.'
        }
      )
    }
  }
)

/*
|--------------------------------------------------------------------------
| Inicialização
|--------------------------------------------------------------------------
*/

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(
      resolve(process.argv[1])
    ).href
) {
  const port = Number(
    process.env.AUTH_PORT || 3001
  )

  server.listen(
    port,
    '127.0.0.1',
    () => {
      console.log(
        `Servidor de autenticação disponível na porta ${port}.`
      )
      console.log(
        'Banco de dados: MySQL'
      )
      console.log(
        `Base de dados: ${
          process.env.DB_NAME ||
          'carrinha_escolar'
        }`
      )
    }
  )
}
