import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Heart, LockKeyhole, Scissors, Sparkles } from 'lucide-react'
import '../styles/login.css'

async function authRequest(path, body) {
  const response = await fetch(`/api/auth/${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Unable to reach your account. Please retry.')
  return data
}

export default function Auth({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    fetch('/api/auth/me').then(async response => {
      if (response.status === 401) return null
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Account storage is unavailable.')
      return body
    }).then(value => { if (active) setUser(value) })
      .catch(() => { if (active) setError('Unable to restore your session. Check that the backend is running, then log in.') })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])
  async function submit(event) {
    event.preventDefault()
    if (!/^[0-9]{6}$/.test(pin)) { setError('Enter your six-digit PIN.'); return }
    setBusy(true); setError('')
    try {
      setUser(await authRequest('login', { pin }))
      setPin('')
    } catch (err) { setError(err.message === 'Failed to fetch' ? 'Cannot reach the backend. Please start it and try again.' : err.message) }
    finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true); setError('')
    try { await authRequest('logout', {}); setUser(null) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  if (checking) return <div className="auth-loading" role="status">Opening your crochet workspace…</div>
  if (user) return <>{error && <div className="notice" role="alert">{error}</div>}{children(user, logout)}</>
  return <div className="studio-login">
    <header className="studio-login-header"><a className="studio-login-brand" href="#shop"><span>MZ</span><div>MZ Crafties<small>Mari&amp;Zect Crafties</small></div></a><a className="studio-back" href="#shop"><ArrowLeft size={15} /> Back to the shop</a></header>
    <main className="studio-login-main"><section className="studio-login-story"><p className="studio-login-pill"><Sparkles size={14} /> A LITTLE HOME FOR HANDMADE</p><h1>Behind every<br />little treasure,<br /><em>there?s you.</em></h1><p>A space for your ideas, your everyday makes, and all the lovely things still to come.</p><div className="studio-login-art" aria-hidden="true"><div><Scissors size={32}/><p>Made slowly.<br />Loved for longer.</p><small>MARI &amp; ZECT CRAFTIES</small></div><span><Heart size={20}/></span></div><div className="studio-story-caption"><Heart size={14} /> Your hands. Your heart. Your little studio.</div></section>
    <section className="studio-login-card" aria-labelledby="auth-title"><div className="studio-login-lock"><LockKeyhole size={23}/></div><p className="eyebrow">THE MAKER?S CORNER</p><h2 id="auth-title">Welcome back.</h2><p>Let?s make room for something lovely.<br />Sign in to your craft workspace.</p><form onSubmit={submit}><fieldset disabled={busy}><label htmlFor="login-pin">Your 6-digit PIN</label><input id="login-pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={pin} onChange={event=>setPin(event.target.value.replace(/[^0-9]/g,'').slice(0,6))} aria-describedby="pin-help" placeholder="??????" /><small id="pin-help">Use the private PIN assigned to your account.</small>{error && <div className="studio-login-error" role="alert">{error}</div>}<button type="submit">{busy ? 'Opening your studio?' : <>Enter your studio <ArrowRight size={16}/></>}</button></fieldset></form><div className="studio-login-help"><LockKeyhole size={13}/><span>Private workspace for the MZ Crafties team.</span></div><p className="studio-pin-help">Need a PIN? Contact your workspace owner.</p></section></main>
    <footer className="studio-login-footer"><span>A little joy. A lot of heart.</span><span>Handmade with love by Mari &amp; Zect.</span></footer>
  </div>
}
