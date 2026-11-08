import Loading from './Loading'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUpRight, Heart, Sparkles, MessageCircle, Package, Search, Scissors, Check, Sun, Moon } from 'lucide-react'
import '../styles/Storefront.css'
import '../styles/landing.css'

const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
const safeLink = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '' } catch { return '' } }

function OrderDialog({ items, quantities, setQuantities, contact, onClose }) {
  const dialog = useRef(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  const selected = items.filter(item => quantities[item.id] > 0)
  const totals = selected.reduce((result, item) => ({ ...result, ['PHP']: (result['PHP'] || 0) + item.price * quantities[item.id] }), {})
  const message = ['Hello MZ Crafties! I would like to order:', ...selected.map(item => `${quantities[item.id]} × ${item.name} — ${money(item.price * quantities[item.id], item.currency)}`), '', ...Object.entries(totals).map(([currency, total]) => `Estimated total: ${money(total, currency)}`), '', 'Please confirm availability, delivery options, and the final total. Thank you!'].join('\n')
  const messenger = safeLink(contact.messenger) || safeLink(contact.facebook)
  const email = contact.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ? contact.email : ''
  async function copy() {
    try { await navigator.clipboard.writeText(message); setNotice('Order copied. Paste it into your Messenger conversation.') }
    catch { setNotice('Select and copy the order summary below, then paste it into Messenger.') }
  }
  return <dialog className="order-dialog" ref={dialog} aria-labelledby="order-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="order-heading"><div><p className="eyebrow">SOMETHING LOVELY, JUST FOR YOU</p><h2 id="order-title">Your order list</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Close order list">×</button></div>
    <p>Choose your favorites and quantities, then contact us to arrange your order.</p>
    <div className="order-items">{items.map(item => <div className="order-row" key={item.id}>
      {item.image ? <img src={item.image} alt="" /> : <span className="order-placeholder" aria-hidden="true">✿</span>}
      <div><strong>{item.name}</strong><span className={`category-tag ${(item.category || 'Crochet') === 'Fuzzy Wire' ? 'category-fuzzy' : 'category-crochet'}`}>{(item.category || 'Crochet') === 'Fuzzy Wire' ? '✨ Fuzzy Wire' : '🧶 Crochet'}</span><small>{money(item.price, item.currency)}</small></div>
      <label>Quantity<input type="number" min="0" max={item.stock} step="1" value={quantities[item.id] || 0} onChange={event => { const value = Math.max(0, Math.min(item.stock, Math.floor(Number(event.target.value) || 0))); setQuantities(previous => ({ ...previous, [item.id]: value })); setNotice('') }} /></label>
    </div>)}</div>
    {selected.length > 0 ? <><div className="order-total">{Object.entries(totals).map(([currency, total]) => <strong key={currency}>Estimated total · {money(total, currency)}</strong>)}</div><label className="order-summary">Your message<textarea readOnly value={message} rows={7} /></label><div className="order-contact-actions"><button type="button" className="secondary" onClick={copy}>Copy order</button>{messenger && <a className="primary" href={messenger} target="_blank" rel="noopener noreferrer">Open Messenger</a>}{email && <a className="primary" href={`mailto:${email}?subject=${encodeURIComponent('MZ Crafties order inquiry')}&body=${encodeURIComponent(message)}`}>Email my order</a>}</div><p className="order-note">For Messenger, copy your order and paste it into the conversation. Your order is confirmed once we reply.</p>{!messenger && !email && <p className="notice">Contact details will be available soon. You can copy your order list for now.</p>}</> : <p className="notice">Select at least one item to prepare your order.</p>}
    <p role="status" className="order-feedback">{notice}</p>
  </dialog>
}

export default function Storefront() {
  const [items, setItems] = useState([])
  const [contact, setContact] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [open, setOpen] = useState(false)
  const [quantities, setQuantities] = useState({})
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dark, setDark] = useState(false)
  useEffect(() => {
    let active = true
    fetch('/api/catalog').then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data }).then(data => { if (active) { setItems(data.items); setContact(data.contact) } }).catch(() => { if (active) setError('Our collection is temporarily unavailable. Please try again soon.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])
  const crochetCount = items.filter(i => (i.category || 'Crochet') === 'Crochet').length
  const fuzzyCount = items.filter(i => i.category === 'Fuzzy Wire').length
  const visibleItems = items.filter(i => (categoryFilter === 'all' || (i.category || 'Crochet') === categoryFilter) && i.name.toLowerCase().includes(search.toLowerCase()))
  const messageLink = safeLink(contact.messenger) || safeLink(contact.facebook)
  const featured = items.filter(item => item.image).slice(0, 2)

  return <div className={`app-shell storefront landing-page ${dark ? 'landing-dark' : ''}`}>
    <header className="topbar shop-topbar"><a className="brand" href="#shop"><span className="brand-mark" aria-hidden="true">MZ</span><span>MZ Crafties<span className="brand-sub">Mari&amp;Zect Crafties</span></span></a><nav className="landing-nav" aria-label="Shop navigation"><a href="#shop-products">The collection</a><a href="#how-to-order">How to order</a><a href="#about-makers">Our story</a></nav><div className="landing-header-actions"><button aria-label={dark ? 'Use light mode' : 'Use dark mode'} onClick={()=>setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><a className="admin-login" href="#admin">Studio login <ArrowUpRight size={14} /></a></div></header>
    <main><section className="shop-hero"><div className="landing-hero-copy"><p className="landing-pill"><Sparkles size={14} /> LITTLE THINGS. MADE WITH LOVE.</p><h1>Small treasures.<br /><em>Extraordinary</em><br />amounts of love.</h1><p>For the everyday, the just-because, and the people who mean everything. Discover handmade pieces by Mari &amp; Zect, one thoughtful stitch at a time.</p><div className="landing-hero-actions"><a className="primary" href="#shop-products">Find your little treasure <ArrowDown size={16} /></a>{messageLink && <a className="landing-message-link" href={messageLink} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Say hello</a>}</div><div className="landing-trust"><span><Check size={14} /> Made by hand</span><span><Heart size={14} /> Made to be loved</span><span><Package size={14} /> Live stock availability</span></div></div><div className="landing-hero-visual"><div className="landing-orbit" aria-hidden="true" /><span className="landing-float-label"><Sparkles size={14} /> A little joy, just for you</span>{featured.length ? <div className="landing-photo-stack">{featured.map((item,index)=><div key={item.id} className={`landing-feature-photo photo-${index}`}><img src={item.image} alt={item.name} /><span>{item.name}<Heart size={14} /></span></div>)}</div> : <div className="landing-quote"><Scissors size={38} /><p>Every stitch,<br />a little love.</p><small>MARI &amp; ZECT CRAFTIES</small></div>}<span className="landing-handmade-seal">100%<small>HANDMADE</small><Heart size={16} /></span></div></section>
      <div className="landing-ribbon" aria-hidden="true"><span>Thoughtfully crafted</span><Sparkles size={16}/><span>A little different. A little special.</span><Sparkles size={16}/><span>Made with love, always</span></div>
      <section className="shop-collection" id="shop-products" aria-labelledby="collection-title"><div className="section-heading"><div><p className="eyebrow">FIND SOMETHING YOU LOVE</p><h2 id="collection-title">Meet your next favorite.</h2><p className="landing-collection-description">Real pieces, ready for a new home. All prices in Philippine pesos.</p></div>{Object.values(quantities).some(value => value > 0) && <button type="button" className="secondary" onClick={() => setOpen(true)}>View my order</button>}</div>
        {loading ? <Loading label="Gathering our handmade treasures..." /> : error ? <div className="notice" role="alert">{error}<button onClick={() => { setLoading(true); setError(''); setRevision(value => value + 1) }}>Retry</button></div> : items.length === 0 ? <p className="shop-empty">New handmade treasures are on their way. Check back soon!</p> : <>
          <div className="landing-collection-toolbar"><div className="category-filter-bar storefront-filter-bar">
            <button type="button" className={`cat-btn ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>All crafts ({items.length})</button>
            <button type="button" className={`cat-btn ${categoryFilter === 'Crochet' ? 'active' : ''}`} onClick={() => setCategoryFilter('Crochet')}>🧶 Crochet ({crochetCount})</button>
            <button type="button" className={`cat-btn ${categoryFilter === 'Fuzzy Wire' ? 'active' : ''}`} onClick={() => setCategoryFilter('Fuzzy Wire')}>✨ Fuzzy Wire ({fuzzyCount})</button>
          </div>
          <label className="landing-search"><Search size={16} /><input type="search" aria-label="Search handmade collection" placeholder="Find something lovely?" value={search} onChange={event=>setSearch(event.target.value)} /></label></div>
          {visibleItems.length === 0 ? <p className="shop-empty">No items in this category yet.</p> : <div className="shop-grid">{visibleItems.map(item => <article className="shop-card" key={item.id}><span className={`landing-stock ${item.stock <= 3 ? 'stock-low' : ''}`}><span />{item.stock <= 3 ? `Only ${item.stock} left` : `${item.stock} in stock`}</span>{item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <div className="shop-no-photo" aria-hidden="true">✿</div>}<div className="shop-card-details"><div className="card-tags"><span className={`category-tag ${(item.category || 'Crochet') === 'Fuzzy Wire' ? 'category-fuzzy' : 'category-crochet'}`}>{(item.category || 'Crochet') === 'Fuzzy Wire' ? '✨ Fuzzy Wire' : '🧶 Crochet'}</span></div><h3>{item.name}</h3><p>{money(item.price, item.currency)}</p><button type="button" className="primary" onClick={() => { setQuantities(previous => ({ ...previous, [item.id]: previous[item.id] || 1 })); setOpen(true) }}><MessageCircle size={14} /> Make it mine <ArrowUpRight size={14} /></button></div></article>)}</div>}
        </>}
      </section>
      <section className="landing-order-section" id="how-to-order"><p className="eyebrow">FROM OUR HANDS TO YOURS</p><h2>A little joy, in three little steps.</h2><p>Personal conversations. Thoughtful details. An order that feels like you.</p><div className="landing-steps">{[[Scissors,'01','Find your favorite','Explore our available pieces and choose the one that makes you smile.'],[MessageCircle,'02','Let?s talk details','Build your order list, then send it to us. We?ll confirm availability and the final total.'],[Package,'03','Leave the rest to us','We?ll arrange payment and delivery with you, and prepare your handmade piece with care.']].map(([Icon,number,title,text])=><article key={number}><div><span>{number}</span><Icon size={23} /></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
      <section className="landing-about" id="about-makers"><div className="landing-about-art" aria-hidden="true"><Heart size={44} /><p>Made slowly.<br />Loved for longer.</p></div><div><p className="eyebrow">HELLO, WE?RE MARI &amp; ZECT</p><h2>A small studio.<br />A whole lot of heart.</h2><p>Welcome to our little corner of handmade. MZ Crafties is a home for crochet and artisan pieces, each shaped by time, care, and the joy of creating something special.</p><p>Have a color or an idea in mind? We?d love to hear it.</p>{messageLink && <a href={messageLink} target="_blank" rel="noopener noreferrer" className="primary">Let?s make something yours <ArrowUpRight size={16}/></a>}</div></section>

    </main><footer>MZ Crafties <span>Handmade with love by Mari &amp; Zect.</span></footer>
      {messageLink && <a className="landing-floating-contact" href={messageLink} target="_blank" rel="noopener noreferrer"><span className="facebook-button-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 22v-9h3l.5-4H14V6.5c0-1.1.3-1.8 1.8-1.8H18V1.2C17.6 1.1 16.3 1 14.8 1 11.6 1 9.5 2.9 9.5 6.3V9H6v4h3.5v9H14Z" /></svg></span><span>Message us on Facebook</span></a>}
    {open && <OrderDialog items={items} quantities={quantities} setQuantities={setQuantities} contact={contact} onClose={() => setOpen(false)} />}
  </div>
}
