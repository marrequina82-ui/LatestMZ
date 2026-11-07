import { useState } from 'react'
import { summarizeProjects } from './dashboard-data'
import '../styles/dashboard.css'

export default function Dashboard({ projects, costs, money, loading, error, onRetry }) {
  const currencies = [...new Set(projects.map(p => p.currency || 'PHP'))].sort()
  if (!currencies.length) currencies.push('PHP')
  const [selected, setSelected] = useState('PHP')
  const currency = currencies.includes(selected) ? selected : currencies[0]
  const data = summarizeProjects(projects, currency, costs)
  const maximum = Math.max(1, ...data.months.flatMap(month => [month.revenue, month.expenses]))
  return <section className="dashboard-section" aria-labelledby="dashboard-title">
    <div className="section-heading"><div><p className="eyebrow">YOUR BUSINESS AT A GLANCE</p><h1 id="dashboard-title" className="workspace-page-title">Dashboard</h1><p className="page-description">A little clarity for everything you create.</p></div><label className="dashboard-currency">Currency<select value={currency} onChange={e => setSelected(e.target.value)}>{currencies.map(code => <option key={code}>{code}</option>)}</select></label></div>
    {loading ? <p role="status" className="empty">Loading your business summary…</p> : error ? <div className="notice" role="alert">{error} <button onClick={onRetry}>Retry connection</button></div> : <>
      <div className="dashboard-kpis">{[
        ['Total sales', money(data.revenue, currency), 'All-time recorded sales'],
        ['Estimated expenses', money(data.expenses, currency), 'Production cost of sold units'],
        ['Estimated profit', money(data.profit, currency), 'Sales minus estimated expenses'],
        ['Units sold', data.units.toLocaleString(), 'Across your projects in this currency'],
      ].map(([label, value, hint]) => <article className="dashboard-kpi" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</div>
      <div className="dashboard-panels">
        <section className="dashboard-panel"><div className="section-heading"><div><h2>Sales &amp; expenses</h2><p>Last six months · {currency}</p></div><div className="dashboard-legend"><span><i className="revenue-dot" />Sales</span><span><i className="expense-dot" />Est. expenses</span></div></div>
          {!data.months.some(month => month.revenue || month.expenses) && <p className="dashboard-empty">No dated sales in the last six months. <a href="#sales">Record your first sale</a>.</p>}
          <div className="dashboard-chart" role="img" aria-label={`Sales and estimated expenses for the last six months in ${currency}. Exact values are in the table below.`}>{data.months.map(month => <div className="dashboard-month" key={month.key}><div className="dashboard-bars"><div className="revenue-bar" style={{ height: `${month.revenue / maximum * 100}%` }} title={`Sales: ${money(month.revenue, currency)}`} /><div className="expense-bar" style={{ height: `${month.expenses / maximum * 100}%` }} title={`Estimated expenses: ${money(month.expenses, currency)}`} /></div><span>{month.label}</span></div>)}</div>
          <details className="dashboard-chart-details"><summary>View monthly figures</summary><div className="sales-table-wrapper"><table className="sales-table"><thead><tr><th>Month</th><th>Sales</th><th>Est. expenses</th></tr></thead><tbody>{data.months.map(month => <tr key={month.key}><th scope="row">{month.label}</th><td>{money(month.revenue, currency)}</td><td>{money(month.expenses, currency)}</td></tr>)}</tbody></table></div></details>
        </section>
        <section className="dashboard-panel"><div className="section-heading"><div><h2>Most sold items</h2><p>All time · ranked by units sold</p></div><a href="#sales">View sales ↗</a></div>
          {data.bestSellers.length === 0 ? <p className="dashboard-empty">Your best sellers will appear here when you record sales.</p> : <ol className="dashboard-ranking">{data.bestSellers.map((item, index) => <li key={item.id}><span className="dashboard-rank">{index + 1}</span>{item.image ? <img src={item.image} alt="" /> : <span className="dashboard-item-placeholder" aria-hidden="true">✳</span>}<div><strong>{item.name}</strong><small>{money(item.revenue, currency)} in sales</small><div className="dashboard-ranking-track"><span style={{ width: `${item.quantity / data.bestSellers[0].quantity * 100}%` }} /></div></div><span className="dashboard-unit-count">{item.quantity}<small>sold</small></span></li>)}</ol>}
        </section>
      </div>
      <p className="dashboard-footnote">Expenses are estimates using each project's current materials, labor, and overhead costs per sold unit, rather than a separate expense ledger. Historical costs may change when project pricing changes. Currencies are shown separately.{data.undatedUnits > 0 && ` ${data.undatedUnits} sold units without dates are included in all-time totals only; their revenue uses the suggested price when no sale price is recorded.`}</p>
      {!projects.length && <a className="primary dashboard-project-link" href="#projects">Add your first project →</a>}
    </>}
  </section>
}
