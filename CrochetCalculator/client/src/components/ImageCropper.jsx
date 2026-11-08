import { BusyLabel } from './Loading'
import { useEffect, useRef, useState } from 'react'
import { cropRect } from '../utils/crop'

export default function ImageCropper({ source, onApply, onCancel }) {
  const dialog = useRef(null)
  const photo = useRef(null)
  const drag = useRef(null)
  const [size, setSize] = useState(null)
  const [shape, setShape] = useState('original')
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: .5, y: .5 })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const node = dialog.current
    const previous = document.activeElement
    node.showModal()
    return () => { node.close(); previous?.focus() }
  }, [])
  const ratio = size ? (shape === 'original' ? size.width / size.height : Number(shape)) : 1
  const rect = size ? cropRect(size.width, size.height, ratio, zoom, position.x, position.y) : null
  function move(event) {
    if (!drag.current || !rect) return
    const start = drag.current
    const scale = event.currentTarget.getBoundingClientRect().width / rect.width
    setPosition({
      x: size.width === rect.width ? .5 : Math.max(0, Math.min(1, start.x - (event.clientX - start.clientX) / scale / (size.width - rect.width))),
      y: size.height === rect.height ? .5 : Math.max(0, Math.min(1, start.y - (event.clientY - start.clientY) / scale / (size.height - rect.height))),
    })
  }
  function apply() {
    if (!rect || busy) return
    setBusy(true); setError('')
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 1600 / Math.max(rect.width, rect.height))
      canvas.width = Math.max(1, Math.round(rect.width * scale))
      canvas.height = Math.max(1, Math.round(rect.height * scale))
      const context = canvas.getContext('2d')
      context.drawImage(photo.current, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
      const result = canvas.toDataURL('image/webp', .92)
      if (atob(result.split(',')[1]).length > 5 * 1024 * 1024) throw new Error('This crop is too large. Try zooming in further.')
      onApply(result)
    } catch (err) { setError(err.message || 'Unable to crop this photo. Please choose another image.'); setBusy(false) }
  }
  return <dialog ref={dialog} className="crop-dialog" aria-labelledby="crop-title" aria-describedby="crop-help" onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <div className="crop-heading"><div><p className="eyebrow">PROJECT PHOTO</p><h2 id="crop-title">Crop your photo</h2></div><button type="button" className="modal-close" disabled={busy} onClick={onCancel} aria-label="Cancel photo crop">×</button></div>
    <p id="crop-help">Drag the photo to position it. Use zoom and the sliders to fine-tune your crop.</p>
    <div className="crop-stage"><div className="crop-frame" style={{ aspectRatio: ratio, width: `min(100%, ${300 * ratio}px)` }} onPointerDown={event => { if (!rect || busy || (event.pointerType === 'mouse' && event.button !== 0)) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { ...position, clientX: event.clientX, clientY: event.clientY } }} onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <img ref={photo} src={source} alt="Photo crop preview" draggable="false" onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError('This image could not be loaded. Please choose another photo.')} style={rect ? { width: `${size.width / rect.width * 100}%`, height: `${size.height / rect.height * 100}%`, left: `${-rect.x / rect.width * 100}%`, top: `${-rect.y / rect.height * 100}%` } : { visibility: 'hidden' }} />
      <div className="crop-grid" aria-hidden="true" />
    </div></div>
    {!size && !error && <BusyLabel>Loading photo...</BusyLabel>}
    <fieldset disabled={!size || busy} className="crop-controls"><label>Crop shape<select value={shape} onChange={event => { setShape(event.target.value); setZoom(1); setPosition({ x: .5, y: .5 }) }}><option value="original">Original proportions</option><option value="1">Square (1:1)</option><option value="1.3333333333333333">Landscape (4:3)</option><option value="0.75">Portrait (3:4)</option></select></label>
      <label>Zoom <span>{zoom.toFixed(1)}×</span><input type="range" min="1" max="4" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <label>Horizontal position<input type="range" min="0" max="1" step="0.001" value={position.x} disabled={!rect || size.width - rect.width < .01} onChange={e => setPosition(p => ({ ...p, x: Number(e.target.value) }))} /></label>
      <label>Vertical position<input type="range" min="0" max="1" step="0.001" value={position.y} disabled={!rect || size.height - rect.height < .01} onChange={e => setPosition(p => ({ ...p, y: Number(e.target.value) }))} /></label>
    </fieldset>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="crop-actions"><button type="button" className="modal-close" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="modal-close" disabled={!size || busy} onClick={() => { setZoom(1); setShape('original'); setPosition({ x: .5, y: .5 }) }}>Reset</button><button type="button" className="primary" disabled={!size || busy} onClick={apply}>{busy ? <BusyLabel>Applying crop...</BusyLabel> : 'Apply crop'}</button></div>
    <p className="helper">Apply the crop, then save your project to keep the photo.</p>
  </dialog>
}
