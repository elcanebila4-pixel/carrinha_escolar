const DB_KEY = 'carrinha_escolar_db'
const LOCAL_SESSION_KEY = 'carrinha_escolar_local_session'

const initialDatabase = {
  alunos: [],
  encarregados: [],
  motoristas: [],
  carrinhas: [],
  rotas: [],
  viagens: [],
  usuarios: [],
  localizacoes: []
}

const resources = {
  students: { table: 'alunos', singular: 'student' },
  guardians: { table: 'encarregados', singular: 'guardian' },
  drivers: { table: 'motoristas', singular: 'driver' },
  vehicles: { table: 'carrinhas', singular: 'vehicle' },
  routes: { table: 'rotas', singular: 'route' },
  trips: { table: 'viagens', singular: 'trip' }
}

function getDatabase() {
  const data = localStorage.getItem(DB_KEY)

  if (!data) {
    saveDatabase(initialDatabase)
    return initialDatabase
  }

  try {
    return { ...initialDatabase, ...JSON.parse(data) }
  } catch {
    saveDatabase(initialDatabase)
    return initialDatabase
  }
}

function saveDatabase(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

// ========================
// CARRINHAS
// ========================

export function listarCarrinhas() {
  return getDatabase().carrinhas
}

export function adicionarCarrinha(carrinha) {
  const db = getDatabase()

  const nova = {
    id: Date.now(),
    ...carrinha
  }

  db.carrinhas.push(nova)
  saveDatabase(db)

  return nova
}

export function atualizarCarrinha(id, dados) {
  const db = getDatabase()
  const index = db.carrinhas.findIndex(c => c.id === id)

  if (index === -1) return null

  db.carrinhas[index] = {
    ...db.carrinhas[index],
    ...dados
  }

  saveDatabase(db)

  return db.carrinhas[index]
}

export function eliminarCarrinha(id) {
  const db = getDatabase()

  db.carrinhas = db.carrinhas.filter(c => c.id !== id)

  saveDatabase(db)
}

// ========================
// ROTAS
// ========================

export function listarRotas() {
  return getDatabase().rotas
}

export function adicionarRota(rota) {
  const db = getDatabase()

  const nova = {
    id: Date.now(),
    ...rota
  }

  db.rotas.push(nova)
  saveDatabase(db)

  return nova
}

export function atualizarRota(id, dados) {
  const db = getDatabase()
  const index = db.rotas.findIndex(r => r.id === id)

  if (index === -1) return null

  db.rotas[index] = {
    ...db.rotas[index],
    ...dados
  }

  saveDatabase(db)

  return db.rotas[index]
}

export function eliminarRota(id) {
  const db = getDatabase()

  db.rotas = db.rotas.filter(r => r.id !== id)

  saveDatabase(db)
}

// ========================
// VIAGENS
// ========================

export function listarViagens() {
  return getDatabase().viagens
}

export function adicionarViagem(viagem) {
  const db = getDatabase()

  const nova = {
    id: Date.now(),
    ...viagem,
    estado: viagem.estado || 'Agendada'
  }

  db.viagens.push(nova)
  saveDatabase(db)

  return nova
}

export function atualizarViagem(id, dados) {
  const db = getDatabase()
  const index = db.viagens.findIndex(v => v.id === id)

  if (index === -1) return null

  db.viagens[index] = {
    ...db.viagens[index],
    ...dados
  }

  saveDatabase(db)

  return db.viagens[index]
}

export function eliminarViagem(id) {
  const db = getDatabase()

  db.viagens = db.viagens.filter(v => v.id !== id)

  saveDatabase(db)
}

// ========================
// ALUNOS
// ========================

export function listarAlunos() {
  return getDatabase().alunos
}

export function adicionarAluno(aluno) {
  const db = getDatabase()

  const novo = {
    id: Date.now(),
    ...aluno
  }

  db.alunos.push(novo)
  saveDatabase(db)

  return novo
}

export function atualizarAluno(id, dados) {
  const db = getDatabase()
  const index = db.alunos.findIndex(a => a.id === id)

  if (index === -1) return null

  db.alunos[index] = {
    ...db.alunos[index],
    ...dados
  }

  saveDatabase(db)

  return db.alunos[index]
}

export function eliminarAluno(id) {
  const db = getDatabase()

  db.alunos = db.alunos.filter(a => a.id !== id)

  saveDatabase(db)
}

// ========================
// BANCO COMPLETO
// ========================

export function obterBancoCompleto() {
  return getDatabase()
}

export function limparBanco() {
  localStorage.removeItem(DB_KEY)
}

function relatedRecord(record, resource, db) {
  if (resource === 'students') {
    const guardian = db.encarregados.find(
      item => item.id === record.guardian_id
    )
    return {
      ...record,
      guardian_name: guardian?.name || record.guardian_name || '',
      guardian_phone: guardian?.phone || record.guardian_phone || ''
    }
  }
  if (resource === 'guardians') {
    return {
      ...record,
      student_count: db.alunos.filter(
        student => student.guardian_id === record.id
      ).length
    }
  }
  if (resource === 'routes' || resource === 'trips') {
    const route =
      resource === 'routes'
        ? record
        : db.rotas.find(item => item.id === record.route_id)
    const vehicle = db.carrinhas.find(item => item.id === route?.vehicle_id)
    const driver = db.motoristas.find(item => item.id === route?.driver_id)
    return {
      ...record,
      ...(resource === 'trips'
        ? {
            route_name: route?.name,
            start_point: route?.start_point,
            end_point: route?.end_point
          }
        : {}),
      vehicle_plate: vehicle?.plate || '',
      driver_name: driver?.name || ''
    }
  }
  return record
}

export function requestLocalApi(path, options = {}) {
  const url = new URL(path, 'http://local')
  const [, , resource, id] = url.pathname.split('/')
  const definition = resources[resource]
  if (!definition)
    throw new Error('Este recurso não está disponível no armazenamento local.')

  const db = getDatabase()
  const method = (options.method || 'GET').toUpperCase()
  const records = db[definition.table]
  const recordId = id === undefined ? null : Number(id)
  const body = options.body ? JSON.parse(options.body) : {}

  if (method === 'GET' && recordId === null) {
    return {
      [resource]: records.map(record => relatedRecord(record, resource, db))
    }
  }

  if (method === 'POST' && recordId === null) {
    if (
      resource === 'vehicles' &&
      records.some(
        item =>
          item.plate.toLocaleLowerCase() === body.plate?.toLocaleLowerCase()
      )
    ) {
      throw new Error('Já existe uma carrinha com esta matrícula.')
    }
    const now = new Date().toISOString()
    const id = Math.max(
      Date.now(),
      ...records.map(item => Number(item.id) + 1 || 0)
    )
    const record = { id, ...body, created_at: now, updated_at: now }
    records.push(record)
    saveDatabase(db)
    return { [definition.singular]: relatedRecord(record, resource, db) }
  }

  const index = records.findIndex(record => record.id === recordId)
  if (index < 0) throw new Error('Registo não encontrado no telefone.')

  if (method === 'PUT') {
    if (
      resource === 'vehicles' &&
      records.some(
        item =>
          item.id !== recordId &&
          item.plate.toLocaleLowerCase() === body.plate?.toLocaleLowerCase()
      )
    ) {
      throw new Error('Já existe uma carrinha com esta matrícula.')
    }
    records[index] = {
      ...records[index],
      ...body,
      updated_at: new Date().toISOString()
    }
    saveDatabase(db)
    return {
      [definition.singular]: relatedRecord(records[index], resource, db)
    }
  }

  if (method === 'DELETE') {
    if (
      resource === 'routes' &&
      db.viagens.some(trip => trip.route_id === recordId)
    ) {
      throw new Error('Não é possível excluir uma rota que já possui viagens.')
    }
    records.splice(index, 1)
    if (resource === 'guardians')
      db.alunos.forEach(student => {
        if (student.guardian_id === recordId) student.guardian_id = null
      })
    if (resource === 'vehicles')
      db.rotas.forEach(route => {
        if (route.vehicle_id === recordId) route.vehicle_id = null
      })
    if (resource === 'drivers')
      db.rotas.forEach(route => {
        if (route.driver_id === recordId) route.driver_id = null
      })
    saveDatabase(db)
    return { success: true }
  }

  throw new Error('Operação não suportada no armazenamento local.')
}

export function iniciarSessaoLocal(email = 'local@carrinhaescolar.app') {
  const session = { email, local: true }
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
  return session
}

export function obterSessaoLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function terminarSessaoLocal() {
  localStorage.removeItem(LOCAL_SESSION_KEY)
}

export function obterResumoLocal(date = new Date().toISOString().slice(0, 10)) {
  const db = getDatabase()
  return {
    students: db.alunos.length,
    drivers: db.motoristas.length,
    vehicles: db.carrinhas.length,
    trips_today: db.viagens.filter(trip => trip.trip_date === date).length
  }
}
