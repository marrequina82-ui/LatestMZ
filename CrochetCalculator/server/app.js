import { randomBytes, createHash } from 'node:crypto'
import { getDatabase, transaction } from './database.js'

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const fail = (status, message) => { throw new HttpError(status, message) }
const hash = token => createHash('sha256').update(token).digest('hex')
const sessionToken = req => /(?:^|;\s*)stitch_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1]
const cookie = (token, age) => `stitch_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`
const attempts = new Map()
function allowAttempt(ip) {
  const now = Date.now()
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key)
  const entry = attempts.get(ip) || { count: 0, until: now + 900000 }
  attempts.set(ip, entry)
  return ++entry.count <= 5
}
async function body(req, limit = 8 * 1024 * 1024) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) fail(413, 'Request or photo is too large.')
    chunks.push(chunk)
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString())
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error()
    return input
  } catch { fail(400, 'Invalid request data.') }
}
export function validateProject(p) {
  if (typeof p.name !== 'string' || !p.name.trim() || [...p.name].length > 120) fail(400, 'Enter a project name up to 120 characters.')
  p.name = p.name.trim()
  for (const key of ['yarn', 'materials', 'hours', 'rate', 'overhead', 'profit']) {
    const value = p[key]
    const limit = ['overhead', 'profit'].includes(key) ? 1000 : 10000000
    if (typeof value !== 'string' || (value.trim() && !/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > limit) fail(400, `Invalid ${key} value.`)
  }
  if (!['PHP', 'USD', 'EUR', 'GBP'].includes(p.currency)) fail(400, 'Choose a supported currency.')
  if (!['Planned', 'In progress', 'Completed'].includes(p.status)) fail(400, 'Choose a valid status.')
  if (typeof p.pattern !== 'string' || Buffer.byteLength(p.pattern) > 200000) fail(400, 'Pattern notes are too long.')
  if (typeof p.image !== 'string') fail(400, 'Invalid photo.')
  if (p.image) {
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(p.image)
    if (!match) fail(400, 'Choose a JPG, PNG, or WebP photo.')
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length > 5 * 1024 * 1024) fail(400, 'Photo must be smaller than 5 MB.')
    const valid = match[1] === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    if (!valid || bytes.toString('base64') !== match[2]) fail(400, 'Invalid photo.')
  }
  if (!p.category || !['Crochet', 'Fuzzy Wire'].includes(p.category)) {
    p.category = 'Crochet'
  }
  if (!Array.isArray(p.sales)) p.sales = []
  if (!Number.isFinite(Number(p.sold)) || Number(p.sold) < 0) p.sold = 0
  delete p.id
  delete p.stock
  return p
}
export function publicItem(row) {
  const p = row.data
  const n = key => Number.isFinite(Number(p[key])) ? Number(p[key]) : 0
  const base = n('yarn') + n('materials') + n('hours') * n('rate')
  return { id: Number(row.id), name: p.name, image: p.image, currency: p.currency, category: p.category || 'Crochet',
    price: Math.round(base * (1 + n('overhead') / 100) * (1 + n('profit') / 100) * 100) / 100, stock: row.stock }
}
const project = row => ({ category: 'Crochet', sold: 0, sales: [], ...row.data, id: Number(row.id), stock: row.stock })

export function createHandler(databaseProvider = getDatabase) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json')
    const reply = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)) }
    try {
      const url = new URL(req.url, 'http://localhost')
      const path = url.pathname
      const method = req.method
      if (!['GET', 'HEAD'].includes(method)) {
        const scheme = process.env.COOKIE_SECURE === 'true' || req.socket?.encrypted ? 'https' : 'http'
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `${scheme}://${req.headers.host}`)) fail(403, 'Request origin is not allowed.')
      }
      if (path === '/api/health' && method === 'GET') return reply(200, { status: 'ok', message: 'Node.js backend is connected' })
      const database = databaseProvider()
      if (path === '/api/auth/login' && method === 'POST') {
        if (!allowAttempt(req.socket?.remoteAddress || 'unknown')) fail(429, 'Too many attempts. Please try again in 15 minutes.')
        const input = await body(req, 1024)
        if (Object.keys(input).some(key => key !== 'pin') || !/^\d{6}$/.test(input.pin) || typeof input.pin !== 'string') fail(400, 'Enter your six-digit PIN.')
        const token = randomBytes(32).toString('hex')
        const remoteUser = database.login ? await database.login(input.pin, hash(token), sessionToken(req) ? hash(sessionToken(req)) : null) : null
        if (database.login && !remoteUser) fail(401, 'PIN is incorrect or has not been assigned. Contact the workspace owner.')
        const user = database.login ? { id: Number(remoteUser.id), email: remoteUser.email } : await transaction(database, async client => {
          const { rows } = await client.query('SELECT id,email FROM (SELECT id,email,COUNT(*) OVER () AS matches FROM users WHERE pin_hash IS NOT NULL AND pin_hash=crypt($1,pin_hash)) matched WHERE matches=1', [input.pin])
          if (!rows.length) fail(401, 'PIN is incorrect or has not been assigned. Contact the workspace owner.')
          const old = sessionToken(req)
          if (old) await client.query('DELETE FROM sessions WHERE token_hash=$1', [hash(old)])
          await client.query('DELETE FROM sessions WHERE expires_at<=NOW()')
          await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')", [hash(token), rows[0].id])
          return { id: Number(rows[0].id), email: rows[0].email }
        })
        res.setHeader('Set-Cookie', cookie(token, 604800))
        return reply(200, user)
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        const token = sessionToken(req)
        if (token) await database.query('DELETE FROM sessions WHERE token_hash=$1', [hash(token)])
        res.setHeader('Set-Cookie', cookie('', 0))
        return reply(200, { ok: true })
      }
      if (path === '/api/catalog' && method === 'GET') {
        const { rows } = await database.query('SELECT id,data,stock FROM projects WHERE stock>0 ORDER BY updated_at DESC')
        return reply(200, { items: rows.map(publicItem), contact: { facebook: process.env.SHOP_FACEBOOK_URL || '', messenger: process.env.SHOP_MESSENGER_URL || '', email: process.env.SHOP_EMAIL || '' } })
      }
      const materialRoute = /^\/api\/materials\/(\d+)$/.exec(path)
      const materialRequest = (path === '/api/materials' && ['GET', 'POST'].includes(method)) || (materialRoute && ['PUT', 'DELETE'].includes(method))
      const route = /^\/api\/projects\/(\d+)(\/stock)?$/.exec(path)
      if (!materialRequest && !(path === '/api/auth/me' && method === 'GET') && !(path === '/api/activity' && method === 'GET') && !(path === '/api/projects' && ['GET','POST'].includes(method)) && !(route && (route[2] ? method === 'PATCH' : ['PUT','DELETE'].includes(method)))) fail(404, 'Endpoint not found.')
      const token = sessionToken(req)
      if (!token) fail(401, 'Please log in to continue.')
      const { rows: users } = await database.query('SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()', [hash(token)])
      if (!users.length) fail(401, 'Your session has expired. Please log in again.')
      const user = { id: Number(users[0].id), email: users[0].email }
      if (path === '/api/auth/me') return reply(200, user)
      if (materialRequest) {
        if (method === 'GET') {
          const { rows } = await database.query('SELECT id,data FROM materials ORDER BY id DESC')
          return reply(200, rows.map(row => ({ ...row.data, id: Number(row.id) })))
        }
        const materialId = materialRoute ? Number(materialRoute[1]) : null
        if (materialRoute && (!Number.isSafeInteger(materialId) || materialId <= 0)) fail(400, 'Invalid material ID.')
        let materialSql, materialValues
        if (method === 'DELETE') { materialSql = 'DELETE FROM materials WHERE id=$1 RETURNING id'; materialValues = [materialId] }
        else {
          const input = await body(req, 16384)
          const data = input.material
          const categories = ['Yarn & Thread', 'Notions & Hardware', 'Stuffing & Filling', 'Packaging']
          if (!data || typeof data !== 'object') fail(400, 'Enter material details.')
          for (const key of ['name', 'category', 'spec', 'unit', 'supplier', 'notes']) {
            if (typeof data[key] !== 'string' || data[key].length > (key === 'notes' ? 1000 : 200)) fail(400, 'Invalid material details.')
          }
          if (!data.name.trim() || !data.unit.trim() || !categories.includes(data.category)) fail(400, 'Enter a name, unit, and category.')
          for (const key of ['quantity', 'unitCost', 'minimum']) if (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key] < 0 || data[key] > 10000000) fail(400, 'Enter valid nonnegative quantities and costs.')
          const clean = Object.fromEntries(['name','category','spec','unit','supplier','notes','quantity','unitCost','minimum'].map(key => [key, data[key]]))
          materialSql = method === 'POST' ? 'INSERT INTO materials(data) VALUES($1) RETURNING id,data' : 'UPDATE materials SET data=$1,updated_at=NOW() WHERE id=$2 AND data=$3::jsonb RETURNING id,data'
          materialValues = method === 'POST' ? [JSON.stringify(clean)] : [JSON.stringify(clean), materialId, JSON.stringify(input.previous)]
        }
        const { rows } = database.mutate ? await database.mutate(materialSql, materialValues, user.id) : await database.query(materialSql, materialValues)
        if (!rows.length) fail(409, 'This material changed or was removed. Refresh and try again.')
        return reply(method === 'POST' ? 201 : 200, rows[0].data ? { ...rows[0].data, id: Number(rows[0].id) } : { id: Number(rows[0].id) })
      }

      if (path === '/api/activity') {
        const before = url.searchParams.get('before') || '9223372036854775807'
        if (!/^[1-9]\d*$/.test(before) || BigInt(before) > 9223372036854775807n) fail(400, 'Invalid history cursor.')
        const { rows } = await database.query('SELECT h.id,h.project_id,h.project_name,h.action,h.detail,h.created_at,u.email FROM activity_history h JOIN users u ON u.id=h.user_id WHERE h.id<$1 ORDER BY h.id DESC LIMIT 51', [before])
        return reply(200, { entries: rows.slice(0,50).map(row => ({ id: Number(row.id), projectId: Number(row.project_id), name: row.project_name, action: row.action, detail: row.detail, createdAt: row.created_at, actor: row.email })), hasMore: rows.length > 50 })
      }
      if (path === '/api/projects' && method === 'GET') {
        const { rows } = await database.query('SELECT id,data,stock FROM projects ORDER BY updated_at DESC')
        return reply(200, rows.map(project))
      }
      const id = route ? Number(route[1]) : undefined
      if (route && (!Number.isSafeInteger(id) || id <= 0)) fail(400, 'Invalid project ID.')
      let sql, values, conflict = false
      if (method === 'DELETE') { sql = 'DELETE FROM projects WHERE id=$1 RETURNING id'; values = [id] }
      else if (method === 'PATCH') {
        const input = await body(req, 1024)
        if (Object.keys(input).some(key => !['stock','previous'].includes(key)) || ![input.stock,input.previous].every(value => Number.isInteger(value) && value >= 0 && value <= 1000000)) fail(400, 'Enter a whole stock quantity between 0 and 1,000,000.')
        sql = 'UPDATE projects SET stock=$1,updated_at=NOW() WHERE id=$2 AND stock=$3 RETURNING id,stock'
        values = [input.stock,id,input.previous]; conflict = true
      } else {
        const p = validateProject(await body(req))
        sql = method === 'POST' ? 'INSERT INTO projects(data,user_id) VALUES($1,$2) RETURNING id,data,stock' : 'UPDATE projects SET data=$1,updated_at=NOW() WHERE id=$2 RETURNING id,data,stock'
        values = [JSON.stringify(p), method === 'POST' ? user.id : id]
      }
      const result = await (database.mutate ? (async () => {
        const { rows } = await database.mutate(sql, values, user.id)
        if (!rows.length) fail(conflict ? 409 : 404, conflict ? 'This item changed or is no longer available. Refresh inventory and try again.' : 'This project no longer exists.')
        return rows[0]
      })() : transaction(database, async client => {
        await client.query("SELECT set_config('app.actor_id',$1,true)", [String(user.id)])
        const { rows } = await client.query(sql, values)
        if (!rows.length) fail(conflict ? 409 : 404, conflict ? 'This item changed or is no longer available. Refresh inventory and try again.' : 'This project no longer exists.')
        return rows[0]
      }))
      return reply(method === 'POST' ? 201 : 200, result.data ? project(result) : { ...result, id: Number(result.id) })
    } catch (error) {
      if (/^\/api\/materials(?:\/|\?|$)/.test(req.url) && (error.reason === 'unsupported_operation' || ['42P01', 'PGRST202', '42501'].includes(error.code))) {
        error.status = 503
        error.message = 'Materials inventory is not set up yet. The workspace owner needs to finish the database update before you can use it.'
      }
      if (['PST01', 'PST02', 'PST03', 'PST04'].includes(error.code)) {
        error.status = error.code === 'PST03' ? 400 : 409
        error.message = error.code === 'PST04' ? 'Undo would exceed the stock limit. Adjust stock first.' : error.code === 'PST01' ? 'Not enough stock. Refresh stock or reduce the sale quantity.' : error.code === 'PST02' ? 'Sales changed. Refresh and try again.' : 'Enter a valid whole sale quantity.'
      }
      if (!error.status) console.error('API storage request failed:', error.code || error.name)
      reply(error.status || 503, { error: error.status ? error.message : 'Database is unavailable. Check the server Supabase configuration and retry.' })
    }
  }
}
export default createHandler()
