const number = value => Number.isFinite(Number(value)) ? Number(value) : 0
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export function summarizeProjects(projects, _currency, costs, now = new Date()) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    return { key: monthKey(date), label: date.toLocaleDateString('en', { month: 'short', year: '2-digit' }), revenue: 0, expenses: 0 }
  })
  let revenue = 0, expenses = 0, units = 0, undatedUnits = 0
  const items = projects.map(p => {
    const breakdown = costs(p)
    const unitCost = number(breakdown.materials) + number(breakdown.labor) + number(breakdown.overhead)
    const records = Array.isArray(p.sales) ? p.sales : []
    let quantity = 0, itemRevenue = 0
    for (const sale of records) {
      if (sale.voidedAt) continue
      const qty = Math.max(0, number(sale.quantity))
      const amount = number(sale.price ?? breakdown.total) * qty
      const expense = unitCost * qty
      quantity += qty; itemRevenue += amount; expenses += expense
      const date = sale.date ? new Date(sale.date) : null
      const bucket = date && months.find(month => month.key === monthKey(date))
      if (bucket) { bucket.revenue += amount; bucket.expenses += expense }
      if (!date || Number.isNaN(date.getTime())) undatedUnits += qty
    }
    const legacy = Math.max(0, number(p.sold) - quantity)
    quantity += legacy; itemRevenue += legacy * number(breakdown.total)
    expenses += legacy * unitCost; undatedUnits += legacy
    units += quantity; revenue += itemRevenue
    return { id: p.id, name: p.name, image: p.image, category: p.category || 'Crochet', stock: number(p.stock), price: number(breakdown.total), quantity, revenue: itemRevenue }
  })
  return { revenue, expenses, profit: revenue - expenses, units, undatedUnits, months,
    bestSellers: items.filter(item => item.quantity > 0).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 5) }
}
