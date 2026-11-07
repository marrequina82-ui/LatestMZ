import { useState } from 'react'
import { request } from '../utils/api'
import '../styles/stocks.css'

function StockRow({ item, costs, money, onStockChange, onSell }) {
  const [quantity, setQuantity] = useState(String(item.stock || 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stock = Number(item.stock || 0)
  const price = costs(item).total
  async function save(event) {
    event.preventDefault()
    if (quantity === '' || !Number.isInteger(Number(quantity)) || Number(quantity) < 0 || Number(quantity) > 1000000) { setError('Enter a whole number from 0 to 1,000,000.'); return }
    setBusy(true); setError('')
    try {
      const result = await request(`/api/projects/${item.id}/stock`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock: Number(quantity), previous: stock }) })
      onStockChange(result)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <tr><td><div className="stocks-product">{item.image ? <img src={item.image} alt="" /> : <span aria-hidden="true">✂</span>}<div><strong>{item.name}</strong><small>{item.status || 'Craft project'}</small></div></div></td><td><span className="stocks-medium">{item.category || 'Crochet'}</span></td><td>{money(price, item.currency || 'PHP')}</td><td><form className="stocks-adjust" onSubmit={save}><div><button type="button" aria-label={`Decrease ${item.name} stock`} disabled={busy || Number(quantity) <= 0} onClick={() => setQuantity(String(Math.max(0, Number(quantity) - 1)))}>−</button><input aria-label={`Stock quantity for ${item.name}`} type="number" min="0" max="1000000" step="1" value={quantity} disabled={busy} onChange={event => setQuantity(event.target.value)} /><button type="button" aria-label={`Increase ${item.name} stock`} disabled={busy || Number(quantity) >= 1000000} onClick={() => setQuantity(String(Number(quantity) + 1))}>+</button></div><button className="stocks-save" type="submit" disabled={busy || quantity === String(stock)}>{busy ? 'Saving…' : 'Save'}</button></form>{error && <p className="stocks-error" role="alert">{error}</p>}</td><td><span className={`stocks-status ${stock <= 2 ? 'is-low' : ''}`}>{stock === 0 ? 'Out of stock' : stock <= 2 ? `Low stock (${stock})` : `In stock (${stock})`}</span></td><td>{money(price * stock, item.currency || 'PHP')}</td><td><button className="stocks-sell" onClick={() => onSell(item)}>Sell</button></td></tr>
}

export default function Stocks({ projects, costs, money, onStockChange, onSell, loading, error, onRetry }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const filtered = projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) && (category === 'all' || (p.category || 'Crochet') === category))
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize)
  const values = new Map()
  filtered.forEach(p => { const currency = 'PHP'; values.set(currency, (values.get(currency) || 0) + costs(p).total * Number(p.stock || 0)) })
  return <section className="stocks-section" aria-labelledby="stocks-title">
    <header className="stocks-heading"><div><p className="eyebrow">FINISHED CRAFT STOCK</p><h1 id="stocks-title">Stocks Management</h1><p>Adjust and monitor finished goods quantities on hand.</p></div><a className="stocks-record" href="#sales">Record Sale</a></header>
    {loading ? <p role="status">Loading stock…</p> : error ? <div className="notice" role="alert">{error} <button onClick={onRetry}>Retry connection</button></div> : <>
      <div className="stocks-toolbar"><input aria-label="Search finished crafts" type="search" placeholder="Search finished crafts to adjust stock…" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} /><div>{[['all', `All Crafts (${projects.length})`], ['Crochet', 'Crochet'], ['Fuzzy Wire', 'Fuzzy Wire']].map(([value, label]) => <button key={value} aria-pressed={category === value} className={category === value ? 'active' : ''} onClick={() => { setCategory(value); setPage(1) }}>{label}</button>)}</div></div>
      <div className="stocks-summary"><article><span>TOTAL FINISHED UNITS</span><strong>{filtered.reduce((sum, p) => sum + Number(p.stock || 0), 0)} <small>units ready</small></strong></article><article><span>TOTAL RETAIL ASSET VALUE</span><strong className="stocks-value">{values.size ? [...values].map(([currency, value]) => <span key={currency}>{money(value, currency)}</span>) : money(0, 'PHP')}</strong></article><article><span>LOW STOCK NOTICE</span><strong className="stocks-low">{filtered.filter(p => Number(p.stock || 0) <= 2).length} <small>need restock · 2 units or fewer</small></strong></article></div>
      <div className="stocks-table-container"><table className="stocks-table"><thead><tr><th>Craft item</th><th>Medium</th><th>Unit price</th><th>Adjust stock quantity</th><th>Stock status</th><th>Inventory value</th><th>Actions</th></tr></thead><tbody>{visible.map(item => <StockRow key={`${item.id}-${item.stock}`} item={item} costs={costs} money={money} onStockChange={onStockChange} onSell={onSell} />)}{!visible.length && <tr><td colSpan="7" className="stocks-empty">No crafts match this view. Try another filter or add a project.</td></tr>}</tbody></table></div>
      <div className="stocks-pagination"><label>Rows per page <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>{[5, 10, 20].map(size => <option key={size}>{size}</option>)}</select></label><span>{filtered.length ? (current - 1) * pageSize + 1 : 0}–{Math.min(current * pageSize, filtered.length)} of {filtered.length}</span><nav aria-label="Stock pages"><button disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current} of {pages}</span><button disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></nav></div>
    </>}
  </section>
}
