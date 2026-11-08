import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeProjects } from '../client/src/components/dashboard-data.js'

test('undone sales are excluded from revenue, costs, rankings and monthly units', () => {
  const project = { id: 1, name: 'Craft', sold: 2, sales: [
    { quantity: 3, price: 50, date: '2026-11-01', voidedAt: '2026-11-08T02:00:00Z' },
    { quantity: 2, price: 40, date: '2026-11-02' },
  ] }
  const summary = summarizeProjects([project], 'PHP', () => ({ materials: 10, labor: 5, overhead: 0, total: 50 }), new Date(2026, 10, 8))
  assert.equal(summary.units, 2)
  assert.equal(summary.revenue, 80)
  assert.equal(summary.expenses, 30)
  assert.equal(summary.profit, 50)
  assert.equal(summary.months.at(-1).revenue, 80)
  assert.equal(summary.bestSellers[0].quantity, 2)
  const fullyUndone = summarizeProjects([{ ...project, sold: 0, sales: project.sales.slice(0, 1) }], 'PHP', () => ({ materials: 10, labor: 5, overhead: 0, total: 50 }))
  assert.equal(fullyUndone.revenue, 0)
  assert.equal(fullyUndone.units, 0)
  assert.deepEqual(fullyUndone.bestSellers, [])
})
