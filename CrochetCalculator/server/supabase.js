export function createSupabaseDatabase(env = process.env, request = fetch) {
  const base = new URL(env.SUPABASE_URL || '')
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw new Error('Set SUPABASE_URL to your Supabase project HTTPS URL.')
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || key.startsWith('sb_publishable_')) throw new Error('Set SUPABASE_SECRET_KEY to your server secret key.')
  async function rpc(operation, args = {}) {
    const headers = { apikey: key, 'Content-Type': 'application/json' }
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`
    const response = await request(new URL('/rest/v1/rpc/tracker_api', base), {
      method: 'POST', headers, body: JSON.stringify({ operation, args }), signal: AbortSignal.timeout(15000),
    })
    const data = await response.json()
    if (!response.ok) { const error = new Error('Supabase API request failed.'); error.code = data.code || `HTTP_${response.status}`; if (/unsupported operation/i.test(data.message || '')) error.reason = 'unsupported_operation'; throw error }
    return { rows: data || [] }
  }
  return {
    rpc,
    async login(pin, tokenHash, oldHash) { return (await rpc('login', { pin, tokenHash, oldHash })).rows[0] },
    async mutate(sql, values, actor) {
      const operation = sql.includes('materials') ? (sql.startsWith('DELETE') ? 'materials_delete' : sql.startsWith('INSERT') ? 'materials_create' : 'materials_update') : sql.startsWith('DELETE') ? 'delete' : sql.includes('SET stock=') ? 'stock' : sql.startsWith('INSERT') ? 'create' : 'update'
      return rpc(operation, { values, actor })
    },
    query(sql, values = []) {
      const operation = sql === 'SELECT id,data FROM materials ORDER BY id DESC' ? 'materials_list' : sql.startsWith('DELETE FROM sessions') ? 'logout'
        : sql.startsWith('SELECT u.id') ? 'session'
        : sql.startsWith('SELECT h.id') ? 'activity'
        : sql.includes('WHERE stock>0') ? 'catalog'
        : sql.startsWith('SELECT id,data,stock') ? 'projects' : null
      if (!operation) throw new Error('Unsupported Supabase API operation.')
      return rpc(operation, { values })
    },
  }
}
