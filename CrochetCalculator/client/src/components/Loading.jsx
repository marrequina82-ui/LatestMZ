import '../styles/loading.css'

export function BusyLabel({ children = 'Saving...' }) {
  return <span className="busy-label" role="status"><span className="ui-spinner" aria-hidden="true" />{children}</span>
}

const Line = ({ wide = false }) => <span className={`skeleton skeleton-line ${wide ? 'wide' : ''}`} />

export default function Loading({ label = 'Loading your workspace...', variant = 'cards', count = 6 }) {
  return <div className={`ui-loading loading-${variant}`} aria-busy="true">
    <div className="loading-message" role="status"><span className="ui-spinner" aria-hidden="true" /><span>{label}<small>Getting everything ready for you.</small></span></div>
    <div className="loading-preview" aria-hidden="true">
      {variant === 'dashboard' ? <><div className="loading-metrics">{[0, 1, 2, 3].map(index => <div className="loading-card" key={index}><Line /><span className="skeleton skeleton-value" /><Line wide /></div>)}</div><div className="loading-panels"><div className="loading-card"><Line /><div className="loading-chart">{[30, 50, 40, 75, 95, 60].map((height, index) => <span className="skeleton" style={{ height: `${height}%` }} key={index} />)}</div></div><div className="loading-card">{[0, 1, 2, 3].map(index => <div className="loading-row" key={index}><span className="skeleton skeleton-avatar" /><div><Line wide /><Line /></div></div>)}</div></div></>
        : variant === 'table' || variant === 'timeline' ? <div className="loading-card">{Array.from({ length: count }, (_, index) => <div className="loading-row" key={index}><span className="skeleton skeleton-avatar" /><div><Line wide /><Line /></div>{variant === 'table' && <><Line /><Line /></>}</div>)}</div>
          : <div className="loading-product-grid">{Array.from({ length: count }, (_, index) => <div className="loading-card" key={index}><div className="skeleton skeleton-photo" /><Line wide /><Line /><span className="skeleton skeleton-value" /></div>)}</div>}
    </div>
  </div>
}
