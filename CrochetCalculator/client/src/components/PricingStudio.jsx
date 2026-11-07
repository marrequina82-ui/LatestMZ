import { useState } from 'react'
import { Calculator, RotateCcw } from 'lucide-react'
import '../styles/pricing-studio.css'

const empty = () => ({ yarn: '', materials: '', hours: '', rate: '', overhead: '', profit: '' })
const fields = [
  ['yarn', 'Yarn / craft material cost', 'The yarn, stems, or wire used for one item.'],
  ['materials', 'Other materials', 'Stuffing, buttons, packaging, and supplies.'],
  ['rate', 'Hourly rate', 'What you earn for an hour of your time.'],
  ['overhead', 'Overhead (%)', 'Tools, electricity, and workspace costs.'],
  ['profit', 'Profit markup (%)', 'Added on top of your total craft cost.'],
]

export default function PricingStudio({ costs, money }) {
  const [values, setValues] = useState(empty)
  const currency = 'PHP'
  const [unit, setUnit] = useState('hrs')
  const update = (key, value) => setValues(previous => ({ ...previous, [key]: value }))
  const breakdown = costs({ ...values, hours: Number(values.hours || 0) / ({ hrs: 1, mins: 60, secs: 3600 }[unit]) })
  const clear = () => { setValues(empty()); setUnit('hrs') }
  return <section className="pricing-studio" aria-labelledby="pricing-studio-title">
    <header className="pricing-studio-heading"><div><p className="eyebrow">TESTING ONLY CALCULATOR</p><h1 id="pricing-studio-title">Craft Pricing Studio</h1><p>Calculate materials, labor time, overhead, and your suggested selling price.</p></div></header>
    <div className="pricing-studio-grid"><section className="pricing-input-panel"><h2><span className="pricing-heading-icon"><Calculator size={18} aria-hidden="true" /></span>Price your work</h2><p>Start with your real costs. Give every piece its worth.</p><div className="pricing-input-grid">
      {fields.slice(0, 2).map(([key, label, helper]) => <label key={key}>{label}<input type="number" min="0" max="10000000" step="0.01" placeholder="0.00" value={values[key]} onChange={event => update(key, event.target.value === '' ? '' : String(Math.min(10000000, Math.max(0, Number(event.target.value)))))} /><small>{helper}</small></label>)}
      <label>Time spent<div className="pricing-time-input"><input aria-label="Time spent" type="number" min="0" max="10000000" step="any" placeholder="0" value={values.hours} onChange={event => update('hours', event.target.value === '' ? '' : String(Math.min(10000000, Math.max(0, Number(event.target.value)))))} /><select aria-label="Time unit" value={unit} onChange={event => { const divisors = { hrs: 1, mins: 60, secs: 3600 }; update('hours', values.hours === '' ? '' : String(Number(values.hours) / divisors[unit] * divisors[event.target.value])); setUnit(event.target.value) }}><option>hrs</option><option>mins</option><option>secs</option></select></div><small>Calculated using your hourly rate.</small></label>
      {fields.slice(2).map(([key, label, helper]) => <label key={key}>{label}<input type="number" min="0" max={key === 'rate' ? 10000000 : 1000} step="0.01" placeholder="0.00" value={values[key]} onChange={event => update(key, event.target.value === '' ? '' : String(Math.min(key === 'rate' ? 10000000 : 1000, Math.max(0, Number(event.target.value)))))} /><small>{helper}</small></label>)}
    </div></section>
    <div className="pricing-result-column"><section className="pricing-result-panel" aria-label="Calculated price"><p className="eyebrow">SUGGESTED SELLING PRICE</p><output className="pricing-result-price" aria-live="polite">{money(breakdown.total, currency)}</output><p>For one handmade creation</p><dl>{[['Materials', breakdown.materials], ['Your labor', breakdown.labor], ['Overhead', breakdown.overhead], ['Profit markup', breakdown.profit]].map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{money(amount, currency)}</dd></div>)}</dl><div className="pricing-cost-total"><span>Total craft cost</span><strong>{money(breakdown.total - breakdown.profit, currency)}</strong></div><small>Materials + labor + overhead, then profit markup. All amounts are in Philippine pesos.</small></section><button type="button" className="pricing-reset-button" onClick={clear}><RotateCcw size={15} aria-hidden="true" /> Reset</button></div></div>
  </section>
}
