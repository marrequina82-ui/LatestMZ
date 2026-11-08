import Loading, { BusyLabel } from './Loading'
import { useEffect, useRef, useState } from 'react'
import { Search, ShoppingBag, ReceiptText, Printer, X, Undo2 } from 'lucide-react'
import '../styles/sales-register.css'
import '../styles/sales-pos.css'

function SaleModal({ onClose, saving, children, className = '', labelledBy, describedBy }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const prev = document.activeElement
    dialog.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      prev?.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialogRef}
      className={`project-modal sale-modal ${className}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={e => {
        e.preventDefault()
        if (!saving) onClose()
      }}
    >
      {children}
    </dialog>
  )
}

export default function Sales({ loading, error: loadError, onRetry, initialProject, projects, money, costs, onUpdateProject }) {
  const [view, setView] = useState('pos')
  const [productSearch, setProductSearch] = useState('')
  const [category, setCategory] = useState('All products')
  const [undoing, setUndoing] = useState(null)
  const [undoTarget, setUndoTarget] = useState(null)
  const [undoError, setUndoError] = useState('')
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('All Channels')
  const [customer, setCustomer] = useState('')
  const [channel, setChannel] = useState('Direct Walk-in')
  const [payment, setPayment] = useState('Cash')
  const [receipt, setReceipt] = useState(null)
  const [page, setPage] = useState(1)
  const channels = ['Instagram DM', 'Facebook Messenger', 'Shopee', 'TikTok Shop', 'Craft Fair', 'Direct Walk-in']
  const [modalOpen, setModalOpen] = useState(Boolean(initialProject))
  const [selectedProjectId, setSelectedProjectId] = useState(initialProject?.id || projects[0]?.id || '')
  const [quantity, setQuantity] = useState('1')
  const [salePrice, setSalePrice] = useState(initialProject ? costs(initialProject).total.toFixed(2) : '')
  const [saleNote, setSaleNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Gather all sales records into a timeline
  const allSales = []
  projects.forEach(p => {
    const pCategory = p.category || 'Crochet'
    const breakdown = costs(p)
    const salesList = Array.isArray(p.sales) ? p.sales : []
    salesList.forEach((s, saleIndex) => {
      allSales.push({
        id: s.id || `${p.id}-${s.date}`,
        projectId: p.id,
        saleIndex,
        voidedAt: s.voidedAt,
        projectName: p.name,
        category: pCategory,
        currency: p.currency,
        quantity: Number(s.quantity || 1),
        price: Number(s.price ?? breakdown.total),
        total: Number(s.price ?? breakdown.total) * Number(s.quantity || 1),
        profit: (Number(s.price ?? breakdown.total) - (breakdown.total - breakdown.profit)) * Number(s.quantity || 1),
        customer: s.customer || 'Not recorded', channel: s.channel || 'Not recorded', payment: s.payment || 'Not recorded', receipt: s.receipt || `MZ-${p.id}-${s.id || s.date}`,
        date: s.date || new Date().toISOString(),
        note: s.note || '',
      })
    })
  })

  // Sort newest first
  allSales.sort((a, b) => new Date(b.date) - new Date(a.date))

  const filteredSales = allSales.filter(s => (channelFilter === 'All Channels' || s.channel === channelFilter) && [s.customer, s.receipt, s.projectName, s.note].join(' ').toLowerCase().includes(search.toLowerCase()))

  const activeSales = filteredSales.filter(sale => !sale.voidedAt)
  async function undoSale(sale) {
    if (undoing || sale.voidedAt) return
    const target = projects.find(project => project.id === sale.projectId)
    if (!target || target.sales[sale.saleIndex]?.voidedAt) { setUndoError('This sale has changed. Refresh sales history and try again.'); return }
    setUndoing(`${sale.projectId}-${sale.id}`); setUndoError(''); setSuccess('')
    try {
      const sales = target.sales.map((record, index) => index === sale.saleIndex ? { ...record, voidedAt: new Date().toISOString() } : record)
      const response = await fetch(`/api/projects/${target.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...target, sales, sold: Math.max(0, Number(target.sold || 0) - sale.quantity) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to undo this sale.')
      onUpdateProject(result)
      setUndoTarget(null)
      setSuccess(`Sale undone. ${sale.quantity} x ${sale.projectName} returned to stock.`)
    } catch (error) { setUndoError(error.message === 'Failed to fetch' ? 'Could not connect. Please retry.' : error.message) }
    finally { setUndoing(null) }
  }

  // Open modal and prefill price
  const openRecordModal = (product) => {
    const first = product?.id ? product : projects[0]
    if (first) {
      setSelectedProjectId(first.id)
      setSalePrice(String(costs(first).total.toFixed(2)))
    }
    setQuantity('1')
    setCustomer('')
    setSaleNote('')
    setError('')
    setSuccess('')
    setModalOpen(true)
  }

  const handleProjectSelect = (id) => {
    setSelectedProjectId(id)
    const p = projects.find(item => item.id === Number(id))
    if (p) setSalePrice(String(costs(p).total.toFixed(2)))
  }

  const handleRecordSale = async (e) => {
    e.preventDefault()
    const target = projects.find(p => p.id === Number(selectedProjectId))
    if (!target) { setError('Select a valid project.'); return }

    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) { setError('Enter a quantity of at least 1.'); return }

    if (qty > Number(target.stock || 0)) { setError(`Only ${Number(target.stock || 0)} in stock. Reduce the quantity or add stock first.`); return }

    const unitPrice = Number(salePrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) { setError('Enter a valid selling price.'); return }

    setSaving(true)
    setError('')
    try {
      const newSale = {
        id: Date.now().toString(),
        quantity: qty,
        price: unitPrice,
        date: new Date().toISOString(),
        note: saleNote.trim(),
        customer: customer.trim() || 'Walk-in customer', channel, payment,
        receipt: `MZ-${new Date().getFullYear()}-${Date.now()}`,
      }

      const updatedSales = [...(Array.isArray(target.sales) ? target.sales : []), newSale]
      const updatedSold = Number(target.sold || 0) + qty

      const updatedProject = {
        ...target,
        currency: 'PHP',
        sold: updatedSold,
        sales: updatedSales,
      }

      const res = await fetch(`/api/projects/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProject),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to record sale.')
      }

      const saved = await res.json()
      onUpdateProject(saved)
      setSuccess(`Recorded sale for ${qty} × ${target.name}!`)
      setModalOpen(false)
      setReceipt({ ...newSale, projectName: target.name, customer: customer.trim() || 'Walk-in customer', total: unitPrice * qty, profit: (unitPrice - (costs(target).total - costs(target).profit)) * qty })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const undoProduct = projects.find(project => project.id === undoTarget?.projectId)
  const selectedProduct = projects.find(project => String(project.id) === String(selectedProjectId))
  const categories = ['All products', ...new Set(projects.map(project => project.category || 'Crochet'))]
  const visibleProducts = projects.filter(project => (category === 'All products' || (project.category || 'Crochet') === category) && project.name.toLowerCase().includes(productSearch.toLowerCase()))


  if (loading || loadError) return <section className="sales-section"><div className="section-heading"><div><p className="eyebrow">POINT OF SALE</p><h1 className="workspace-page-title">Sell products</h1></div></div>{loading ? <Loading label="Getting your products ready..." /> : <div className="notice" role="alert">{loadError}<button onClick={onRetry}>Retry connection</button></div>}</section>
  return (
    <section className="sales-section" aria-labelledby="sales-title">
      <div className="section-heading sales-register-heading"><div><p className="eyebrow">POINT OF SALE</p><h1 id="sales-title" className="workspace-page-title">Let’s make a sale</h1><p className="page-description">Choose a product, record the sale, and print a receipt.</p></div><nav className="pos-view-switch" aria-label="Sales view"><button className={view === 'pos' ? 'active' : ''} aria-pressed={view === 'pos'} onClick={() => setView('pos')}><ShoppingBag size={16} /> Sell products</button><button className={view === 'history' ? 'active' : ''} aria-pressed={view === 'history'} onClick={() => setView('history')}><ReceiptText size={16} /> Sales history</button></nav></div>
      {undoError && !undoTarget && <div className="notice" role="alert">{undoError}</div>}
      {success && <p className="pos-success" role="status">{success}</p>}
      {view === 'pos' ? <div className="pos-catalog">
        <div className="pos-catalog-toolbar"><div className="pos-product-search"><Search size={18} /><input type="search" aria-label="Search products" placeholder="Find a product by name..." value={productSearch} onChange={event => setProductSearch(event.target.value)} /></div><span>{visibleProducts.length} products available to browse</span></div>
        <nav className="pos-categories" aria-label="Product categories">{categories.map(value => <button key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</nav>
        <div className="pos-products">{visibleProducts.map(product => <button type="button" className="pos-product" key={product.id} onClick={() => openRecordModal(product)} aria-label={`Record sale for ${product.name}`}><div className="pos-product-image">{product.image ? <img src={product.image} alt={product.name} loading="lazy" /> : <span className="pos-image-placeholder"><ShoppingBag size={34} /><span>No product photo</span></span>}<span className={`pos-stock ${Number(product.stock || 0) <= 2 ? 'low' : ''}`}>{Number(product.stock || 0)} in stock</span></div><div className="pos-product-info"><small>{product.category || 'Crochet'}</small><h2>{product.name}</h2><div><strong>{money(costs(product).total)}</strong><span className="pos-add">Record sale +</span></div></div></button>)}</div>
        {!visibleProducts.length && <div className="pos-empty"><ShoppingBag size={32} /><h2>{projects.length ? 'No matching products' : 'Your shop is ready for products'}</h2><p>{projects.length ? 'Try another name or category.' : 'Add a craft product and a photo to start selling.'}</p>{!projects.length && <a href="#projects" className="primary">Add a product</a>}</div>}
      </div> : <>
      <div className="sales-register-toolbar"><div><Search size={16} /><input type="search" aria-label="Search sales" placeholder="Search customer, receipt number, or craft name?" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></div><nav aria-label="Sales channels">{['All Channels',...channels].map(value => <button key={value} className={channelFilter === value ? 'active' : ''} aria-pressed={channelFilter === value} onClick={() => { setChannelFilter(value); setPage(1) }}>{value}</button>)}</nav></div>
      <div className="sales-register-summary">{[['ACTIVE SALES',activeSales.length],['TOTAL REVENUE',money(activeSales.reduce((sum,s)=>sum+s.total,0))],['EST. PRODUCTION COST',money(activeSales.reduce((sum,s)=>sum+s.total-s.profit,0))],['EST. PROFIT',money(activeSales.reduce((sum,s)=>sum+s.profit,0))]].map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <div className="sales-register-table"><table><thead><tr>{['Receipt #','Date','Customer','Channel','Items ordered','Payment','Amount','Est. profit','Actions'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{filteredSales.slice((Math.min(page,Math.max(1,Math.ceil(filteredSales.length/10)))-1)*10,Math.min(page,Math.max(1,Math.ceil(filteredSales.length/10)))*10).map(sale=><tr key={`${sale.projectId}-${sale.id}`} className={sale.voidedAt ? 'sale-undone-row' : ''}><td><button className="receipt-number" onClick={()=>setReceipt(sale)}>{sale.receipt}</button>{sale.voidedAt && <span className="sale-undone-tag">Undone</span>}</td><td>{new Date(sale.date).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</td><td>{sale.customer}</td><td><span className="sales-register-tag">{sale.channel}</span></td><td>{sale.quantity} &times; {sale.projectName}</td><td><span className="sales-register-tag">{sale.payment}</span></td><td>{money(sale.total)}</td><td className="sales-register-profit">{money(sale.profit)}</td><td><div className="sale-row-actions"><button className="receipt-slip" onClick={()=>setReceipt(sale)}><ReceiptText size={13} /> Slip</button>{!sale.voidedAt && <button className="sale-undo" disabled={Boolean(undoing)} onClick={() => { setUndoError(''); setUndoTarget(sale) }} aria-label={`Undo sale ${sale.receipt}`}>{undoing === `${sale.projectId}-${sale.id}` ? <BusyLabel>Undoing...</BusyLabel> : <><Undo2 size={13} /> Undo</>}</button>}</div></td></tr>)}{!filteredSales.length && <tr><td colSpan="9" className="sales-register-empty">No sales match this view. Record a sale to start your register.</td></tr>}</tbody></table></div>
      <div className="sales-register-pagination"><span>{filteredSales.length} sales / 10 per page</span><div><button disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {Math.min(page,Math.max(1,Math.ceil(filteredSales.length/10)))} of {Math.max(1,Math.ceil(filteredSales.length/10))}</span><button disabled={page>=Math.ceil(filteredSales.length/10)} onClick={()=>setPage(page+1)}>Next</button></div></div>
      </>}
      {undoTarget && <SaleModal className="undo-sale-modal" labelledBy="undo-sale-title" describedBy="undo-sale-description" saving={Boolean(undoing)} onClose={() => setUndoTarget(null)}>
        <div className="undo-sale-heading"><span className="undo-sale-icon" aria-hidden="true"><Undo2 size={23} /></span><button type="button" className="undo-sale-close" aria-label="Close undo confirmation" disabled={Boolean(undoing)} onClick={() => setUndoTarget(null)}><X size={18} /></button></div>
        <p className="undo-sale-eyebrow">SALE CORRECTION</p><h2 id="undo-sale-title">Undo this sale?</h2><p id="undo-sale-description">The items will return to stock and this sale will be excluded from your totals.</p>
        <div className="undo-sale-product">{undoProduct?.image ? <img src={undoProduct.image} alt="" /> : <span className="undo-sale-placeholder" aria-hidden="true"><ShoppingBag size={25} /></span>}<div><strong>{undoTarget.projectName}</strong><span>{undoTarget.quantity} &times; {money(undoTarget.price)}</span></div><strong>{money(undoTarget.total)}</strong></div>
        <dl className="undo-sale-details"><div><dt>Receipt</dt><dd>{undoTarget.receipt}</dd></div><div><dt>Stock after undo</dt><dd>{Number(undoProduct?.stock || 0)} <span aria-hidden="true">&rarr;</span> <strong>{Number(undoProduct?.stock || 0) + undoTarget.quantity} units</strong><span className="undo-stock-added">+{undoTarget.quantity}</span></dd></div></dl>
        <p className="undo-sale-note"><ReceiptText size={15} aria-hidden="true" />Your receipt stays in history, marked as undone.</p>
        {undoError && <div className="notice" role="alert">{undoError}</div>}
        <div className="undo-sale-actions"><button type="button" autoFocus disabled={Boolean(undoing)} onClick={() => setUndoTarget(null)}>Keep sale</button><button type="button" className="primary" disabled={Boolean(undoing)} onClick={() => undoSale(undoTarget)}>{undoing ? <BusyLabel>Undoing sale...</BusyLabel> : <><Undo2 size={15} /> Undo sale</>}</button></div>
      </SaleModal>}
      {receipt && <SaleModal onClose={()=>setReceipt(null)}><div className="receipt-print-toolbar"><span>Artisan Sales Slip</span><button onClick={()=>window.print()}><Printer size={15} /> Print</button><button aria-label="Close receipt" onClick={()=>setReceipt(null)}><X size={17} /></button></div><article className="artisan-receipt">{receipt.voidedAt && <p className="sale-undone-tag">UNDONE - stock restored; excluded from totals</p>}<header><span className="receipt-logo">MZ</span><h2>MZ Crafties</h2><p>Mari&amp;Zect Crafties Studio</p><small>HANDCRAFTED FIBER ART &amp; CROCHET</small></header><dl className="receipt-meta"><div><dt>Receipt No.</dt><dd>{receipt.receipt}</dd></div><div><dt>Date</dt><dd>{new Date(receipt.date).toLocaleDateString('en-PH')}</dd></div><div><dt>Customer</dt><dd>{receipt.customer}</dd></div><div><dt>Channel</dt><dd>{receipt.channel}</dd></div></dl><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody><tr><td>{receipt.projectName}</td><td>{receipt.quantity}</td><td>{money(receipt.price)}</td><td>{money(receipt.total)}</td></tr></tbody></table><div className="receipt-total"><strong>TOTAL</strong><strong>{money(receipt.total)}</strong></div><p className="receipt-payment">Payment method <strong>{receipt.payment}</strong></p>{receipt.note && <p className="receipt-note">{receipt.note}</p>}<div className="receipt-care"><strong>Artisan Care Guide</strong><p>Handle handmade items gently. Follow the care instructions supplied with your item.</p></div><p className="receipt-thanks">Salamat for supporting local handmade craft!</p></article></SaleModal>}
      {/* Record Sale Modal */}
      {modalOpen && (
        <SaleModal onClose={() => setModalOpen(false)} saving={saving}>
          <div className="customer-sale-header"><span><ShoppingBag size={18} aria-hidden="true" /></span><h2>Record sale</h2><button type="button" aria-label="Close sale form" disabled={saving} onClick={()=>setModalOpen(false)}><X size={18} /></button></div>
          {selectedProduct && <div className="pos-checkout-product">{selectedProduct.image ? <img src={selectedProduct.image} alt="" /> : <ShoppingBag size={30} />}<div><small>SELECTED PRODUCT</small><strong>{selectedProduct.name}</strong><span>{Number(selectedProduct.stock || 0)} in stock &middot; {money(costs(selectedProduct).total)} each</span></div></div>}
          <form className="customer-sale-form" onSubmit={handleRecordSale} aria-busy={saving}>
            <fieldset disabled={saving}>
              <div className="customer-sale-two"><label>Customer Name (optional)<input maxLength={120} value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="e.g. Maria Clara" /></label><label>Sales Channel<select value={channel} onChange={e=>setChannel(e.target.value)}>{channels.map(value=><option key={value}>{value}</option>)}</select></label></div>
              <label>Payment Method<select value={payment} onChange={e=>setPayment(e.target.value)}>{['Cash','GCash','Maya','Bank transfer','ShopeePay','Other'].map(value=><option key={value}>{value}</option>)}</select></label>
              <div className="customer-sale-item"><label>Craft Item Sold<select value={selectedProjectId} onChange={e=>handleProjectSelect(e.target.value)}>{projects.map(p=><option key={p.id} value={p.id}>{p.name} ({money(costs(p).total)})</option>)}</select></label><label>Quantity<input required type="number" min="1" max={Number(selectedProduct?.stock || 0)} step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} /></label></div>
              <label>Selling Price per Unit (PHP)<input required type="number" min="0" step="0.01" value={salePrice} onChange={e=>setSalePrice(e.target.value)} /></label>
              <label>Order Notes / Delivery Details (Optional)<textarea maxLength={1000} rows={2} placeholder="e.g. gift wrap, delivery instructions?" value={saleNote} onChange={e=>setSaleNote(e.target.value)} /></label>
            </fieldset>
            <div className="customer-sale-total"><div><span>TOTAL DUE</span><strong>{money(Number(salePrice || 0)*Number(quantity || 0))}</strong></div><div><span>EST. PROFIT</span><strong>{money((Number(salePrice || 0)-(projects.find(p=>p.id===Number(selectedProjectId)) ? costs(projects.find(p=>p.id===Number(selectedProjectId))).total-costs(projects.find(p=>p.id===Number(selectedProjectId))).profit : 0))*Number(quantity || 0))}</strong></div></div>
            {error && <div className="notice" role="alert">{error}</div>}
            {success && <p role="status">{success}</p>}
            <div className="customer-sale-footer"><button type="button" disabled={saving} onClick={()=>setModalOpen(false)}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? <BusyLabel>Recording sale...</BusyLabel> : 'Save & Generate Slip'}</button></div>
          </form>
        </SaleModal>
      )}
    </section>
  )
}
