import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { getDatabase } from './database.js'

test('sales deduct stock once and reject overselling and stale histories atomically', { skip: process.env.RUN_DATABASE_TESTS !== 'true' }, async () => {
  delete process.env.SUPABASE_URL
  const database = process.env.TEST_DATABASE_URL ? new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }) : getDatabase()
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    await client.query('CREATE TEMP TABLE projects (id BIGINT PRIMARY KEY, data JSONB NOT NULL, stock INTEGER NOT NULL) ON COMMIT DROP')
    await client.query(await readFile(new URL('./sale-stock.sql', import.meta.url), 'utf8'))
    const original = { name: 'Test craft', sales: [], sold: 0 }
    await client.query('INSERT INTO projects VALUES (1,$1,10)', [original])
    const sold = { ...original, sales: [{ id: 'sale-1', quantity: 3, price: 50 }], sold: 3 }
    const update = async data => (await client.query('UPDATE projects SET data=$1 WHERE id=1 RETURNING stock,data', [data])).rows[0]
    assert.equal((await update(sold)).stock, 7)
    assert.equal((await update(sold)).stock, 7, 'retry must not deduct twice')
    assert.equal((await update({ ...sold, name: 'Renamed craft' })).stock, 7)
    for (const [data, code] of [
      [{ ...sold, sales: [...sold.sales, { id: 'sale-2', quantity: 8 }] }, 'PST01'],
      [original, 'PST02'],
      [{ ...sold, sales: [{ ...sold.sales[0], quantity: 1 }] }, 'PST02'],
      [{ ...sold, sales: [...sold.sales, { id: 'sale-2', quantity: 1.5 }] }, 'PST03'],
    ]) {
      await client.query('SAVEPOINT invalid_sale')
      await assert.rejects(update(data), error => error.code === code)
      await client.query('ROLLBACK TO SAVEPOINT invalid_sale')
      const row = (await client.query('SELECT stock,data FROM projects WHERE id=1')).rows[0]
      assert.equal(row.stock, 7)
      assert.equal(row.data.sales.length, 1, 'failed sale must not be saved')
    }
    const final = await update({ ...sold, sales: [...sold.sales, { id: 'sale-2', quantity: 7 }], sold: 999 })
    assert.equal(final.stock, 0)
    assert.equal(final.data.sold, 10)
    const undone = { ...final.data, sales: final.data.sales.map((sale, index) => index === 0 ? { ...sale, voidedAt: '2026-11-08T02:00:00.000Z' } : sale) }
    const restored = await update(undone)
    assert.equal(restored.stock, 3)
    assert.equal(restored.data.sold, 7)
    assert.equal((await update(undone)).stock, 3, 'retrying undo must not restore stock twice')
    await client.query('SAVEPOINT stale_undo')
    await assert.rejects(update(final.data), error => error.code === 'PST02')
    await client.query('ROLLBACK TO SAVEPOINT stale_undo')
    const allUndone = await update({ ...restored.data, sales: restored.data.sales.map(sale => sale.voidedAt ? sale : { ...sale, voidedAt: '2026-11-08T02:01:00.000Z' }) })
    assert.equal(allUndone.stock, 10)
    assert.equal(allUndone.data.sold, 0)
  } finally {
    await client.query('ROLLBACK')
    client.release()
    await database.end()
  }
})
