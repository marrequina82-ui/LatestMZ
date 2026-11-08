import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseDatabase } from './supabase.js'

test('Supabase API keeps server keys in headers and sends atomic login and stock operations', async () => {
  const calls = []
  const db = createSupabaseDatabase({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' }, async (url, options) => {
    calls.push({ url: url.toString(), ...options })
    return { ok: true, json: async () => [{ id: 2, email: 'admin@example.com' }] }
  })
  assert.equal((await db.login('012345', 'hash', null)).id, 2)
  await db.mutate('UPDATE projects SET stock=$1', [12,3,10], 2)
  assert.equal(calls[0].url, 'https://test.supabase.co/rest/v1/rpc/tracker_api')
  assert.equal(calls[0].headers.apikey, 'sb_secret_test')
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.equal(JSON.parse(calls[0].body).operation, 'login')
  assert.deepEqual(JSON.parse(calls[1].body), { operation: 'stock', args: { values: [12,3,10], actor: 2 } })
  assert.ok(!calls[0].body.includes('sb_secret_test'))
})

test('Supabase API rejects publishable keys and hides upstream error details', async () => {
  assert.throws(() => createSupabaseDatabase({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'sb_publishable_test' }), /server secret/)
  const db = createSupabaseDatabase({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' }, async () => ({ ok: false, status: 404, json: async () => ({ code: 'PGRST202', message: 'private information' }) }))
  await assert.rejects(db.rpc('check'), error => error.code === 'PGRST202' && !error.message.includes('private'))
})

test('older materials API is classified without exposing upstream details', async () => {
  const db = createSupabaseDatabase({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' }, async () => ({ ok: false, status: 400, json: async () => ({ code: 'P0001', message: 'Unsupported operation', details: 'private database context' }) }))
  await assert.rejects(db.query('SELECT id,data FROM materials ORDER BY id DESC'), error => error.reason === 'unsupported_operation' && error.code === 'P0001' && !error.message.includes('private'))
})
