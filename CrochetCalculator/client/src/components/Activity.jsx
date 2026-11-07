import { useEffect, useState } from 'react'
import { Search, RefreshCw, ShoppingBag, Package, FolderPen, Plus, Trash2, History, UserRound, ArrowDown } from 'lucide-react'
import { request } from '../utils/api'
import '../styles/activity.css'

const labels = { sale_recorded: 'Sale recorded', created: 'Created project', edited: 'Edited project', deleted: 'Deleted project', stock_updated: 'Updated stock' }
export default function Activity() {
  const [entries, setEntries] = useState([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    request('/api/activity').then(data => { if (active) { setEntries(data.entries); setMore(data.hasMore) } }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [revision])
  async function loadMore() {
    setBusy(true); setError('')
    try { const data = await request(`/api/activity?before=${entries.at(-1).id}`); setEntries(list => [...list, ...data.entries]); setMore(data.hasMore) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const visible = entries.filter(entry => (filter === 'all' || (filter === 'sale' ? entry.action === 'sale_recorded' : filter === 'inventory' ? entry.action === 'stock_updated' : ['created', 'edited', 'deleted'].includes(entry.action))) && [entry.name, entry.detail, entry.actor, labels[entry.action] || entry.action].join(' ').toLowerCase().includes(query.toLowerCase()))
  return <section className="activity-section" aria-labelledby="activity-title"><div className="section-heading"><div><p className="eyebrow">SHARED WORKSPACE ACTIVITY</p><h1 id="activity-title" className="workspace-page-title">Activity history</h1></div><button type="button" className="modal-close" disabled={busy} onClick={() => { setBusy(true); setError(''); setEntries([]); setMore(false); setRevision(value => value + 1) }}><RefreshCw size={15} className={busy ? 'activity-spin' : ''} aria-hidden="true" /> Refresh</button></div><p className="page-description">Project and inventory changes by all admins. Each entry shows who made the change.</p>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="activity-toolbar"><div className="activity-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search activity by project, change, or user" placeholder="Search activity, projects, or users?" value={query} onChange={event => setQuery(event.target.value)} /></div><div role="group" aria-label="Filter activity">{[['all', 'All'], ['sale', 'Sale'], ['project', 'Project'], ['inventory', 'Inventory']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <ol className="activity-timeline">{visible.map(entry => <li key={entry.id} className={`activity-event ${entry.action}`}><span className="activity-event-icon" aria-hidden="true">{entry.action === 'sale_recorded' ? <ShoppingBag size={15} /> : entry.action === 'stock_updated' ? <Package size={15} /> : entry.action === 'deleted' ? <Trash2 size={15} /> : entry.action === 'created' ? <Plus size={15} /> : <FolderPen size={15} />}</span><div className="activity-event-content"><h2>{labels[entry.action] || entry.action}<span> ? {entry.name}</span></h2><p>{entry.detail}</p><div className="activity-actor"><span className="activity-actor-avatar" aria-hidden="true"><UserRound size={12} /></span><span>By <strong>{entry.actor || 'Unknown user'}</strong></span></div></div><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></li>)}</ol>
    {!busy && entries.length > 0 && visible.length === 0 && <div className="activity-no-matches"><h2>No matching activity</h2><p>Try another search or filter. Search covers the entries loaded so far.</p><button onClick={() => { setQuery(''); setFilter('all') }}>Clear filters</button></div>}
    {busy && <div className="activity-loading" role="status"><span className="activity-loading-label"><RefreshCw size={15} className="activity-spin" aria-hidden="true" /> Loading activity?</span>{!entries.length && <div aria-hidden="true" className="activity-skeletons">{[1, 2, 3].map(index => <div key={index}><span /><div><i /><i /><i /></div></div>)}</div>}</div>}
    {!busy && !error && entries.length === 0 && <div className="activity-no-matches"><History size={30} aria-hidden="true" /><h2>No activity yet</h2><p>All admins' project and stock changes will appear here automatically.</p></div>}
    {more && <button type="button" className="primary activity-load-more" disabled={busy} onClick={loadMore}><ArrowDown size={15} aria-hidden="true" /> Load older activity</button>}
  </section>
}
