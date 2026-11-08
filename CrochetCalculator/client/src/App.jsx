import Loading, { BusyLabel } from './components/Loading'
import { useEffect, useRef, useState } from 'react'
import { Menu, X, Sun, Moon, Scissors, PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-react'
import './styles/App.css'
import './styles/design.css'
import './styles/theme.css'
import './styles/workspace.css'
import Auth from './components/Auth'
import Inventory from './components/Inventory'
import Stocks from './components/Stocks'
import PricingStudio from './components/PricingStudio'
import Activity from './components/Activity'
import ImageCropper from './components/ImageCropper'
import Storefront from './components/Storefront'
import Sales from './components/Sales'
import Dashboard from './components/Dashboard'

const currentPage = () => ['projects', 'stocks', 'pricing', 'sales', 'inventory', 'activity'].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'dashboard'

const blank = () => ({ category: 'Crochet', name: '', pattern: '', image: '', status: 'In progress', currency: 'PHP', yarn: '', materials: '', hours: '', timeSpent: '', timeUnit: 'hrs', rate: '', overhead: '', profit: '', sold: 0, sales: [] })
const fieldsFor = category => [
  ['yarn', category === 'Fuzzy Wire' ? 'Fuzzy wire / stems' : 'Yarn cost', category === 'Fuzzy Wire' ? 'Pipe cleaners and fuzzy wire stems used.' : 'The yarn used for this project.'],
  ['materials', 'Other materials', category === 'Fuzzy Wire' ? 'Floral stems, tape, hot glue, wrapping, and supplies.' : 'Stuffing, buttons, packaging, and supplies.'],
  ['hours', 'Time spent', 'Calculated using your hourly rate.'],
  ['rate', 'Hourly rate', 'What you earn for an hour of your time.'],
  ['overhead', 'Overhead (%)', 'Tools, electricity, and workspace costs.'],
  ['profit', 'Profit markup (%)', 'Added on top of your total craft cost.']
]
function costs(p) { const materials = +p.yarn + +p.materials; const labor = +p.hours * +p.rate; const overhead = (materials + labor) * +p.overhead / 100; const cost = materials + labor + overhead; return { materials, labor, overhead, profit: cost * +p.profit / 100, total: cost * (1 + +p.profit / 100) } }
const timeDivisors = { hrs: 1, mins: 60, secs: 3600 }
const timeUnitOf = p => Object.hasOwn(timeDivisors, p.timeUnit) ? p.timeUnit : 'hrs'
const timeSpentOf = p => p.timeSpent ?? p.hours
const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)

async function loadProjects() {
  const response = await fetch('/api/projects')
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'The backend is unavailable. Start the tracker backend, then retry.')
  }
  return response.json()
}
const storageError = error => error.message === 'Failed to fetch'
  ? 'Cannot reach project storage. Start the tracker backend, then retry.'
  : error.message

function ProjectModal({ children, onClose, className = '', describedBy }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])
  return <dialog ref={dialogRef} className={`project-modal ${className}`} aria-labelledby="project-modal-title" aria-describedby={describedBy} onCancel={event => { event.preventDefault(); onClose() }}>
    {children}
  </dialog>
}

function Workspace({ user, onLogout, loggingOut }) {
  const [page, setPage] = useState(currentPage)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('mz-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })
  useEffect(() => { try { localStorage.setItem('mz-theme', theme) } catch { /* Theme still works when storage is unavailable. */ } }, [theme])
  const [saleProject, setSaleProject] = useState(null)
  useEffect(() => {
    const updatePage = () => { setPage(currentPage()); setMenuOpen(false) }
    window.addEventListener('hashchange', updatePage)
    return () => window.removeEventListener('hashchange', updatePage)
  }, [])
  const [projects, setProjects] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [viewed, setViewed] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [project, setProject] = useState(blank)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [connected, setConnected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [cropSource, setCropSource] = useState(null)
  const originalPhoto = useRef('')
  const fileInput = useRef(null)
  const imageRead = useRef(0)
  async function refresh() {
    setLoading(true)
    try { setProjects(await loadProjects()); setConnected(true); setMessage('') }
    catch (error) { setConnected(false); setMessage(storageError(error)) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    loadProjects().then(data => { if (active) { setProjects(data); setConnected(true) } }).catch(error => { if (active) setMessage(storageError(error)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => { const handler = e => { if (dirty) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler) }, [dirty])
  function change(key, value) { setProject(p => ({ ...p, [key]: value })); setDirty(true) }
  function changeTime(value, unit) {
    setProject(p => ({ ...p, timeSpent: value, timeUnit: unit, hours: value === '' ? '' : String(Number(value) / timeDivisors[unit]) }))
    setDirty(true)
  }
  function select(p) { if (dirty && !window.confirm('Discard unsaved changes?')) return; setEditorOpen(true); setCropSource(null); originalPhoto.current = p?.image || ''; imageRead.current++; setProject(p ? { ...p } : blank()); setDirty(false); setMessage(''); if (fileInput.current) fileInput.current.value = '' }
  function closeEditor() {
    if (saving || (dirty && !window.confirm('Discard unsaved changes?'))) return
    imageRead.current++
    setDirty(false)
    setEditorOpen(false)
    setMessage('')
  }
  async function removeProject(p) {
    if (saving) return
    setSaving(true); setMessage(''); setDeleteError('')
    try {
      const response = await fetch(`/api/projects/${p.id}`, { method: 'DELETE' })
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Could not delete the project. Please retry.') }
      setProjects(list => list.filter(item => item.id !== p.id))
      if (project.id === p.id) setProject(blank())
      setDeleteTarget(null)
      setMessage('Project deleted.')
    } catch (error) { setDeleteError(storageError(error)) }
    finally { setSaving(false) }
  }
  function readPhoto(file) {
    if (!file || saving || cropSource) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage('Choose a JPG, PNG, or WebP image smaller than 5 MB.'); return }
    const version = ++imageRead.current
    const reader = new FileReader(); reader.onload = () => { if (version === imageRead.current) { setCropSource(reader.result); setMessage('') } }; reader.onerror = () => { if (version === imageRead.current) setMessage('This photo could not be read. Please try again.') }; reader.readAsDataURL(file)
  }
  function upload(event) {
    readPhoto(event.target.files[0])
    event.target.value = ''
  }
  function pastePhoto(event) {
    if (saving || cropSource) return
    const item = Array.from(event.clipboardData.items).find(item => item.kind === 'file' && item.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (!file) return
    event.preventDefault()
    readPhoto(file)
  }
  async function save(event) {
    event.preventDefault(); setSaving(true); setMessage('')
    try { const res = await fetch(project.id ? `/api/projects/${project.id}` : '/api/projects', { method: project.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...project, currency: 'PHP' }) }); if (!res.ok) { const body = await res.json(); throw new Error(body.error || 'Unable to save project.') } const saved = await res.json(); setProject(saved); setProjects(list => [saved, ...list.filter(p => p.id !== saved.id)]); setDirty(false); setConnected(true); imageRead.current++; setEditorOpen(false); setMessage('Project saved. Your photo, pattern, and pricing are all together.') }
    catch (error) { setMessage(error.message === 'Failed to fetch' ? 'Unable to connect. Your edits are still here; please try saving again.' : error.message) }
    finally { setSaving(false) }
  }
  const [categoryFilter, setCategoryFilter] = useState('all')
  const breakdown = costs(project)
  const availableProjects = page === 'projects' ? projects.filter(p => Number(p.stock || 0) > 0) : projects
  const filtered = availableProjects.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) && (categoryFilter === 'all' || (p.category || 'Crochet') === categoryFilter))
  const crochetCount = availableProjects.filter(p => (p.category || 'Crochet') === 'Crochet').length
  const fuzzyCount = availableProjects.filter(p => p.category === 'Fuzzy Wire').length

  return <div data-theme={theme} className={`app-shell workspace-shell ${page === 'dashboard' ? 'dashboard-one-page' : page === 'stocks' ? 'stocks-one-page' : page === 'projects' ? 'projects-page' : ''} ${menuOpen ? 'workspace-menu-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <button type="button" className="desktop-drawer-toggle" aria-label={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="workspace-sidebar" onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button>
    <div className="workspace-mobile-bar"><span className="workspace-mobile-title">MZ Crafties</span><button type="button" className="workspace-menu-button" aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <><X size={17} aria-hidden="true" /> Close menu</> : <><Menu size={17} aria-hidden="true" /> Menu</>}</button></div>
    {menuOpen && <button className="workspace-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside id="workspace-sidebar" className="topbar workspace-topbar" aria-label="Workspace sidebar" onKeyDown={event => { if (event.key === 'Escape') setMenuOpen(false) }}><a className="brand" href="/"><span className="brand-mark" aria-hidden="true">MZ</span><span>MZ Crafties<span className="brand-sub">Mari&amp;Zect Crafties</span></span></a><nav className="header-nav" aria-label="Main navigation">
      <a title="Dashboard" aria-label="Dashboard" href="#dashboard" className={page === 'dashboard' ? 'active' : ''} aria-current={page === 'dashboard' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg><span>Dashboard</span></a>
      <a title="Projects" aria-label="Projects" href="#projects" className={page === 'projects' ? 'active' : ''} aria-current={page === 'projects' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h7l2 2h9v11H3Z M3 7V4h7l2 3" /></svg><span>Projects</span><span className="sidebar-badge">{projects.length}</span></a>
      <a title="Stocks" aria-label="Stocks" href="#stocks" className={page === 'stocks' ? 'active' : ''} aria-current={page === 'stocks' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v9" /></svg><span>Stocks</span><span className="sidebar-badge badge-quantity">{projects.reduce((sum, p) => sum + Number(p.stock || 0), 0)} pcs</span></a>
      <a title="Sales" aria-label="Sales" href="#sales" className={page === 'sales' ? 'active' : ''} aria-current={page === 'sales' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16l-1 13H5L4 8Z M8 8V6a4 4 0 0 1 8 0v2 M9 14l2 2 4-4" /></svg><span>Sales</span><span className="sidebar-badge badge-sales">{projects.reduce((sum, p) => sum + (Number(p.sold) || 0), 0)}</span></a>
      <a title="Inventory" aria-label="Inventory" href="#inventory" className={page === 'inventory' ? 'active' : ''} aria-current={page === 'inventory' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v9 M7 6l9 5" /></svg><span>Inventory</span><span className="sidebar-badge badge-stock">{projects.filter(p => Number(p.stock || 0) <= 2).length} low</span></a>
      <a title="History" aria-label="History" href="#activity" className={page === 'activity' ? 'active' : ''} aria-current={page === 'activity' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2" /></svg><span>History</span></a>
      <a title="Pricing Studio" aria-label="Pricing Studio" href="#pricing" className={page === 'pricing' ? 'active' : ''} aria-current={page === 'pricing' ? 'page' : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8 M8 10h1 M12 10h1 M16 10h.1 M8 14h1 M12 14h1 M16 14h.1 M8 18h1 M12 18h1 M16 18h.1" /></svg><span>Pricing Studio</span></a>
    </nav><div className="account-actions"><span className="account-avatar" aria-hidden="true">{user.email.charAt(0).toUpperCase()}</span><span className="account-email" title={user.email}>{user.email}</span><button type="button" className="logout-button" disabled={saving || loggingOut} onClick={() => { if (dirty && !window.confirm('Discard unsaved changes and log out?')) return; onLogout() }}>{loggingOut ? <BusyLabel>Logging out...</BusyLabel> : <><LogOut size={14} aria-hidden="true" /> Log out</>}</button><button type="button" className="workspace-theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}</button><span className="connection"><i className={connected ? 'online' : ''} />{loading ? <BusyLabel>Connecting...</BusyLabel> : connected ? 'Storage connected' : 'Storage offline'}</span></div></aside>
    <main key={page}>{page === 'dashboard' ? <Dashboard projects={projects} costs={costs} money={money} loading={loading} error={!connected ? message : ''} onRetry={refresh} /> : page === 'pricing' ? <PricingStudio costs={costs} money={money} /> : page === 'stocks' ? <Stocks projects={projects} loading={loading} error={!connected ? message : ''} onRetry={refresh} costs={costs} money={money} onSell={p => { setSaleProject(p); window.location.hash = 'sales' }} onStockChange={result => setProjects(list => list.map(p => p.id === result.id ? { ...p, stock: result.stock } : p))} /> : page === 'inventory' ? <Inventory title={page === 'stocks' ? 'Stocks' : 'Inventory'} priceOf={p => money(costs(p).total, p.currency)} onStockChange={result => setProjects(list => list.map(p => p.id === result.id ? { ...p, stock: result.stock } : p))} /> : page === 'activity' ? <Activity /> : page === 'sales' ? <Sales loading={loading} error={!connected ? message : ''} onRetry={refresh} initialProject={saleProject} projects={projects} money={money} costs={costs} onUpdateProject={saved => setProjects(list => list.map(p => p.id === saved.id ? saved : p))} /> : <><section className="library projects-library"><div className="section-heading projects-heading"><div><p className="eyebrow">YOUR HANDMADE COLLECTION</p><h1>{page === 'pricing' ? 'Pricing Studio' : 'My projects'} <span className="count">{availableProjects.length}</span></h1><p>{page === 'pricing' ? 'Choose a project to edit materials, labor, overhead, and selling prices.' : 'Manage your crochet & craft designs, materials costs, and pricing.'}</p></div><button type="button" className="primary" disabled={saving} onClick={() => select(null)}>+ New project</button></div>
      <div className="projects-toolbar">
      <div className="category-filter-bar">
        <button type="button" aria-pressed={categoryFilter === 'all'} className={`cat-btn ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>All crafts ({availableProjects.length})</button>
        <button type="button" aria-pressed={categoryFilter === 'Crochet'} className={`cat-btn ${categoryFilter === 'Crochet' ? 'active' : ''}`} onClick={() => setCategoryFilter('Crochet')}>🧶 Crochet ({crochetCount})</button>
        <button type="button" aria-pressed={categoryFilter === 'Fuzzy Wire'} className={`cat-btn ${categoryFilter === 'Fuzzy Wire' ? 'active' : ''}`} onClick={() => setCategoryFilter('Fuzzy Wire')}>✨ Fuzzy Wire ({fuzzyCount})</button>
      </div>
      <div className="library-toolbar"><div className="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input aria-label="Search projects" type="search" placeholder="Search your projects…" value={query} onChange={e => setQuery(e.target.value)} /></div></div></div>
      {loading ? <Loading label="Loading your craft collection..." /> : availableProjects.length === 0 ? <div className="empty"><span className="empty-icon">&#10035;</span><div><h3>No available products yet</h3><p>Add stock to a project in Stocks to show it here.</p></div></div> : <div className="project-grid">{filtered.map(p => <article key={p.id} className="project-card">
        <button type="button" className="project-card-main" disabled={saving} onClick={() => page === 'pricing' ? select(p) : setViewed(p)} aria-label={`${page === 'pricing' ? 'Price' : 'View'} ${p.name}`}>
          {p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : <div className="no-photo" aria-hidden="true"><Scissors size={30} /><small>{p.category || 'Crochet'}</small></div>}
          <div className="project-card-info">
            <div className="card-tags">
              <span className={`category-tag ${(p.category || 'Crochet') === 'Fuzzy Wire' ? 'category-fuzzy' : 'category-crochet'}`}>{(p.category || 'Crochet') === 'Fuzzy Wire' ? '✨ Fuzzy Wire' : '🧶 Crochet'}</span>
              <span className="card-status">{p.status}</span>
            </div>
            <h3>{p.name}</h3>
            <span className="card-price">{money(costs(p).total, p.currency)}</span>
          </div>
        </button>
        <div className="project-card-footer"><span>{p.stock || 0} in stock</span></div>
        <div className="card-actions">
          <button type="button" disabled={saving} onClick={() => select(p)} aria-label={`Edit ${p.name}`} title="Edit project"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5" /></svg></button>
          <button type="button" className="delete-action" disabled={saving} onClick={() => { setDeleteError(''); setDeleteTarget(p) }} aria-label={`Delete ${p.name}`} title="Delete project"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7" /></svg></button>
        </div>
      </article>)}{filtered.length === 0 && <div className="projects-no-results" role="status"><span className="projects-empty-symbol" aria-hidden="true">&#8981;</span><h2>No projects found</h2><p>{query ? `No projects match "${query}" in this category.` : `You haven't added any ${categoryFilter === 'all' ? '' : categoryFilter + ' '}projects in this view yet.`}</p><button type="button" className="projects-clear-filters" onClick={() => { setQuery(''); setCategoryFilter('all') }}>Show all projects</button></div>}</div>}</section>
      {message && !editorOpen && <div className="notice" role="status">{message}{!connected && <button type="button" onClick={refresh}>Retry connection</button>}</div>}
      {deleteTarget && <ProjectModal className="delete-modal" describedBy="delete-description" onClose={() => { if (!saving) setDeleteTarget(null) }}>
        <div className="delete-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7" /></svg></div>
        <p className="eyebrow">YOUR COLLECTION</p><h2 id="project-modal-title">Delete this project?</h2>
        <p id="delete-description">This will permanently remove the project, including its photo, pattern, and pricing. This cannot be undone.</p>
        <div className="delete-preview">{deleteTarget.image ? <img src={deleteTarget.image} alt="" /> : <span className="delete-placeholder" aria-hidden="true">&#10035;</span>}<div><strong>{deleteTarget.name}</strong><span>{money(costs(deleteTarget).total, deleteTarget.currency)}</span></div></div>
        {deleteError && <div className="notice" role="alert">{deleteError}</div>}
        <div className="delete-buttons"><button type="button" className="cancel-delete" disabled={saving} onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="confirm-delete" disabled={saving} onClick={() => removeProject(deleteTarget)}>{saving ? <BusyLabel>Deleting...</BusyLabel> : 'Delete project'}</button></div>
        <span className="delete-status">{saving ? 'Your project is being deleted.' : ''}</span>
      </ProjectModal>}
      {viewed && <ProjectModal className="craft-detail-modal" onClose={() => setViewed(null)}>
        <div className="craft-detail-hero">
          {viewed.image ? <img src={viewed.image} alt={viewed.name} /> : <div className="craft-detail-placeholder" aria-hidden="true">&#9986;</div>}
          <div className="craft-detail-actions">
            <button type="button" aria-label="Edit project" title="Edit project" onClick={() => { setViewed(null); select(viewed) }}>&#9998;</button>
            <button type="button" className="craft-detail-delete" aria-label="Delete project" title="Delete project" onClick={() => { setViewed(null); setDeleteError(''); setDeleteTarget(viewed) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7" /></svg></button>
            <button type="button" aria-label="Close project details" onClick={() => setViewed(null)}>&times;</button>
          </div>
          <div className="craft-detail-tags"><span>{viewed.category || 'Crochet'}</span><span className={viewed.status === 'Completed' ? 'is-completed' : ''}>{viewed.status}</span></div>
        </div>
        <div className="craft-detail-body">
          <div className="craft-detail-heading"><div><p className="craft-detail-label">{viewed.category || 'Crochet'}</p><h2 id="project-modal-title">{viewed.name}</h2></div><div className="craft-detail-price"><span className="craft-detail-label">SELLING PRICE</span><strong>{money(costs(viewed).total, viewed.currency)}</strong></div></div>
          <dl className="craft-detail-metrics">
            <div><dt>MATERIALS COST</dt><dd>{money(costs(viewed).materials, viewed.currency)}</dd></div>
            <div><dt>PROFIT MARGIN</dt><dd className="craft-detail-profit">{costs(viewed).total > 0 ? `${Math.round(costs(viewed).profit / costs(viewed).total * 100)}%` : '0%'}</dd></div>
            <div><dt>CRAFTING TIME</dt><dd>{timeSpentOf(viewed) || 0} {timeUnitOf(viewed)}</dd></div>
            <div><dt>TOTAL CRAFT COST</dt><dd>{money(costs(viewed).total - costs(viewed).profit, viewed.currency)}</dd></div>
            <div><dt>LABOR</dt><dd>{money(costs(viewed).labor, viewed.currency)}</dd></div>
            <div><dt>OVERHEAD ({viewed.overhead || 0}%)</dt><dd>{money(costs(viewed).overhead, viewed.currency)}</dd></div>
            <div><dt>PROFIT MARKUP ({viewed.profit || 0}%)</dt><dd>{money(costs(viewed).profit, viewed.currency)}</dd></div>
            <div><dt>HOURLY RATE</dt><dd>{money(Number(viewed.rate) || 0, viewed.currency)}</dd></div>
          </dl>
          <section className="craft-detail-pattern"><h3>Pattern</h3><p>{viewed.pattern || 'No pattern added yet.'}</p></section>

          <div className="craft-detail-footer"><span>In stock: <strong>{viewed.stock || 0} units available</strong></span><button type="button" onClick={() => setViewed(null)}>Done</button></div>
        </div>
      </ProjectModal>}
      {editorOpen && <ProjectModal onClose={closeEditor}><form onSubmit={save} onPaste={pastePhoto} aria-busy={saving}><div className="modal-toolbar"><span className="eyebrow">YOUR HANDMADE CREATION</span><button type="button" className="modal-close" disabled={saving} onClick={closeEditor} aria-label="Close project editor">Close <span aria-hidden="true">&times;</span></button></div><div className="editor-title"><div><p className="eyebrow">{project.id ? 'A MAKE TO REMEMBER' : 'MAKE ROOM FOR SOMETHING NEW'}</p><h2 id="project-modal-title">{project.id ? 'Your craft' : 'Create a craft'}</h2></div><span>{dirty ? 'Unsaved changes' : project.id ? 'Saved to your collection' : 'Let’s bring it together'}</span></div>
      {message && <div className="notice" role="status">{message}{!connected && <button type="button" onClick={refresh}>Retry connection</button>}</div>}
      <fieldset disabled={saving} className="editor-fieldset"><div className="editor-layout"><div className="editor-left"><section className="panel"><div className="panel-heading"><span className="step">01</span><div><h2>The little details</h2><p>A face, name, and classification for your handmade creation.</p></div></div><div className="details-grid"><div className="photo-area" tabIndex={saving ? -1 : 0} aria-label="Project photo. Paste an image with Ctrl+V or Command+V.">{project.image ? <img className="photo-preview" src={project.image} alt="Project preview" /> : <div className="upload-art"><span>+</span><strong>Add craft photo</strong><small>JPG, PNG, WebP · up to 5 MB</small></div>}<label className="upload-button">{project.image ? 'Change photo' : 'Choose a photo'}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} /></label><small className="photo-paste-hint">Or paste an image with Ctrl+V / ⌘V</small>{project.image && <button type="button" className="upload-button crop-photo-button" onClick={() => setCropSource(originalPhoto.current || project.image)}>Crop photo</button>}{project.image && <button type="button" className="text-button" onClick={() => { imageRead.current++; originalPhoto.current = ''; change('image', ''); fileInput.current.value = '' }}>Remove photo</button>}</div><div className="detail-fields"><label>Craft classification<select value={project.category || 'Crochet'} onChange={e => change('category', e.target.value)}><option value="Crochet">🧶 Crochet</option><option value="Fuzzy Wire">✨ Fuzzy Wire</option></select></label><label>Project name<input required maxLength={120} value={project.name} onChange={e => change('name', e.target.value)} placeholder={project.category === 'Fuzzy Wire' ? 'e.g. Fuzzy wire tulip bouquet' : 'e.g. Daisy granny square tote'} /></label><label>Project status<select value={project.status} onChange={e => change('status', e.target.value)}><option>In progress</option><option>Completed</option><option>Planned</option></select></label><div className="details-price-estimate"><span id="details-price-label">Estimated selling price</span><output aria-labelledby="details-price-label">{money(breakdown.total, project.currency)}</output><small>Updates automatically from the materials, time, hourly rate, overhead, and profit entered below.</small></div></div></div></section>
      <section className="panel"><div className="panel-heading"><span className="step">02</span><div><h2>Price your work</h2><p>Start with your real costs. Give every piece its worth.</p></div></div><div className="cost-fields">{fieldsFor(project.category || 'Crochet').map(([key, label, helper]) => key === 'hours' ? <div className="time-field" key={key}><label htmlFor="time-spent">{label}</label><div className="time-input"><input id="time-spent" className="time-number" type="number" inputMode="decimal" min="0" max={10000000 * timeDivisors[timeUnitOf(project)]} step="any" placeholder="0" value={timeSpentOf(project)} onChange={e => changeTime(e.target.value, timeUnitOf(project))} aria-describedby="time-helper" /><select aria-label="Time unit" value={timeUnitOf(project)} onChange={e => changeTime(timeSpentOf(project), e.target.value)}><option value="hrs">hrs</option><option value="mins">mins</option><option value="secs">secs</option></select></div><small id="time-helper">{helper}</small></div> : <label key={key}>{label}<input type="number" min="0" max={key === 'overhead' || key === 'profit' ? '1000' : '10000000'} step="0.01" placeholder="0.00" value={project[key]} onChange={e => change(key, e.target.value)} /><small>{helper}</small></label>)}</div></section>
      <section className="panel"><div className="panel-heading"><span className="step">03</span><div><h2>{project.category === 'Fuzzy Wire' ? 'Craft notes & instructions' : 'Pattern & notes'}</h2><p>Keep the instructions you’ll want to come back to.</p></div></div><label>Instructions &amp; notes<textarea rows={7} maxLength={50000} value={project.pattern} onChange={e => change('pattern', e.target.value)} placeholder={project.category === 'Fuzzy Wire' ? 'Stem count, wire gauge, petal shapes, bouquet arrangement notes…' : 'Hook size, yarn weight, stitches, and all the little details…\n\nRound 1: Start with a magic ring.\nRound 2: …'} /></label><p className="helper">Paste your pattern, add a reference link, or write your own notes.</p></section></div>
      <aside><section className="price-panel"><p className="eyebrow">SUGGESTED SELLING PRICE</p><div className="price">{money(breakdown.total, project.currency)}</div><p className="price-caption">For one lovely handmade creation</p><dl>{[['Materials', breakdown.materials], ['Your labor', breakdown.labor], ['Overhead', breakdown.overhead], ['Profit markup', breakdown.profit]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value, project.currency)}</dd></div>)}</dl><div className="total-line"><span>Total craft cost</span><strong>{money(breakdown.total - breakdown.profit, project.currency)}</strong></div><p className="price-note">Materials + your time + overhead + profit. A thoughtful starting point for pricing your work.</p></section><div className="save-panel"><h3>All your details, stitched together.</h3><p>Save this craft to keep your photo, notes, and pricing in your collection.</p><button className="primary save-button" type="submit">{saving ? <BusyLabel>Saving your craft...</BusyLabel> : project.id ? 'Save changes ↗' : 'Save craft ↗'}</button><small>{dirty ? 'You have unsaved changes' : 'A home for everything you make'}</small></div><div className="kind-note">&#10035; <p>Handmade takes time.<br /><strong>Your time has value.</strong></p></div></aside></div></fieldset></form>{cropSource && <ImageCropper source={cropSource} onCancel={() => setCropSource(null)} onApply={image => { originalPhoto.current = cropSource; change('image', image); setCropSource(null); setMessage('') }} />}</ProjectModal>}
    </>}</main><footer>MZ Crafties <span>Mari&amp;Zect Crafties</span></footer>
  </div>
}

export default function App() {
  const [admin, setAdmin] = useState(() => ['admin', 'dashboard', 'projects', 'stocks', 'pricing', 'inventory', 'sales', 'activity'].includes(window.location.hash.slice(1)))
  useEffect(() => {
    const update = () => setAdmin(['admin', 'dashboard', 'projects', 'stocks', 'pricing', 'inventory', 'sales', 'activity'].includes(window.location.hash.slice(1)))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return admin ? <Auth>{(user, onLogout, loggingOut) => <Workspace user={user} onLogout={onLogout} loggingOut={loggingOut} />}</Auth> : <Storefront />
}
