import { useState } from 'react'
import { ShoppingBag, TriangleAlert, ArrowRight } from 'lucide-react'
import { summarizeProjects } from './dashboard-data'
import '../styles/dashboard.css'

export default function Dashboard({ projects, costs, money, loading, error, onRetry }) {
  const [inspectedMonth, setInspectedMonth] = useState(null)
  const lowStock = projects.filter(project => Number(project.stock || 0) <= 2)
  const margin = data => data.revenue > 0 ? `${Math.round(data.profit / data.revenue * 100)}% margin` : null
  const currency = 'PHP'
  const data = summarizeProjects(projects, currency, costs)
  const maximum = Math.max(1, ...data.months.flatMap(month => [month.revenue, month.expenses]))
  return <section className="dashboard-section" aria-labelledby="dashboard-title">
    <div className="section-heading"><div><p className="eyebrow">YOUR BUSINESS AT A GLANCE</p><h1 id="dashboard-title" className="workspace-page-title">Dashboard</h1><p className="page-description">A little clarity for everything you create.</p></div><div className="dashboard-header-actions"><a className="primary dashboard-record-sale" href="#sales"><ShoppingBag size={15} aria-hidden="true" /> Record Sale</a></div></div>
    {loading ? <p role="status" className="empty">Loading your business summary…</p> : error ? <div className="notice" role="alert">{error} <button onClick={onRetry}>Retry connection</button></div> : <>
      {lowStock.length > 0 && <aside className="dashboard-restock"><span className="restock-icon" aria-hidden="true"><TriangleAlert size={21} /></span><div><strong>INVENTORY RESTOCK ALERT ({lowStock.length} ITEMS LOW)</strong><p>{lowStock.slice(0, 2).map(item => `${item.name} (${item.stock || 0} left)`).join(' ? ')}{lowStock.length > 2 ? ` ? +${lowStock.length - 2} more` : ''}</p></div><a href="#inventory">Review Inventory <ArrowRight size={14} aria-hidden="true" /></a></aside>}
      <div className="dashboard-kpis">{[
        ['Total sales', money(data.revenue, currency), 'All-time recorded sales'],
        ['Estimated expenses', money(data.expenses, currency), 'Production cost of sold units'],
        ['Estimated profit', money(data.profit, currency), 'Sales minus estimated expenses'],
        ['Units sold', data.units.toLocaleString(), 'Across your projects'],
      ].map(([label, value, hint]) => <article className="dashboard-kpi" key={label}><div className="dashboard-kpi-label"><span>{label}</span>{label === 'Estimated profit' && margin(data) && <span className="dashboard-margin">{margin(data)}</span>}<i aria-hidden="true" /></div><strong>{value}</strong><small>{hint}</small></article>)}</div>
      <div className="dashboard-panels">
        <section className="dashboard-panel"><div className="section-heading"><div><h2>Sales &amp; expenses</h2><p>Last six months · {currency}</p></div><div className="dashboard-legend"><span><i className="revenue-dot" />Sales</span><span><i className="expense-dot" />Est. expenses</span></div></div>
          {!data.months.some(month => month.revenue || month.expenses) && <p className="dashboard-empty">No dated sales in the last six months. <a href="#sales">Record your first sale</a>.</p>}
          <div className="dashboard-chart-insight" aria-live="polite">{inspectedMonth ? `${inspectedMonth.label}: Sales ${money(inspectedMonth.revenue, currency)} ? Est. expenses ${money(inspectedMonth.expenses, currency)}` : 'Hover or focus on a month to inspect its breakdown'}</div>
          <div className="dashboard-chart" role="img" aria-label={`Sales and estimated expenses for the last six months in ${currency}. Exact values are in the table below.`}>{data.months.map(month => <div className="dashboard-month" key={month.key} tabIndex={0} onMouseEnter={() => setInspectedMonth(month)} onFocus={() => setInspectedMonth(month)} aria-label={`${month.label}: sales ${money(month.revenue, currency)}, estimated expenses ${money(month.expenses, currency)}`}><div className="dashboard-bars"><div className="revenue-bar" style={{ height: `${month.revenue / maximum * 100}%` }} title={`Sales: ${money(month.revenue, currency)}`} /><div className="expense-bar" style={{ height: `${month.expenses / maximum * 100}%` }} title={`Estimated expenses: ${money(month.expenses, currency)}`} /></div><span>{month.label}</span></div>)}</div>
          <details className="dashboard-chart-details"><summary>View monthly figures</summary><div className="sales-table-wrapper"><table className="sales-table"><thead><tr><th>Month</th><th>Sales</th><th>Est. expenses</th></tr></thead><tbody>{data.months.map(month => <tr key={month.key}><th scope="row">{month.label}</th><td>{money(month.revenue, currency)}</td><td>{money(month.expenses, currency)}</td></tr>)}</tbody></table></div></details>
        </section>
        <section className="dashboard-panel"><div className="section-heading"><div><h2>Most sold items</h2><p>All time · ranked by units sold</p></div><a href="#sales">View sales ↗</a></div>
          {data.bestSellers.length === 0 ? <p className="dashboard-empty">Your best sellers will appear here when you record sales.</p> : <ol className="dashboard-ranking">{data.bestSellers.map((item, index) => <li key={item.id}><span className="dashboard-rank">{index + 1}</span><div><strong>{item.name}</strong><small>{item.category} ? {money(item.price, currency)} ? <span className="dashboard-stock">{item.stock} in stock</span></small><div className="dashboard-ranking-track"><span style={{ width: `${item.quantity / data.bestSellers[0].quantity * 100}%` }} /></div></div><span className="dashboard-unit-count">{item.quantity} sold<small>{money(item.revenue, currency)}</small></span></li>)}</ol>}
        </section>
      </div>
      <p className="dashboard-footnote">Expenses are estimates using each project's current materials, labor, and overhead costs per sold unit, rather than a separate expense ledger. Historical costs may change when project pricing changes. All amounts are in Philippine pesos.{data.undatedUnits > 0 && ` ${data.undatedUnits} sold units without dates are included in all-time totals only; their revenue uses the suggested price when no sale price is recorded.`}</p>
      {!projects.length && <a className="primary dashboard-project-link" href="#projects">Add your first project →</a>}
    </>}
  </section>
}
