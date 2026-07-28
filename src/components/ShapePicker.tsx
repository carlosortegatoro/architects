import { useEffect, useRef, useState } from 'react'
import type { ParticleShape } from '../types'

type ShapePickerProps = {
  value: ParticleShape
  onChange: (shape: ParticleShape) => void
}

const SHAPES: Array<{ value: ParticleShape; label: string }> = [
  { value: 'circle', label: 'Circle' },
  { value: 'cut-corner-rect', label: 'Cut-corner rectangle' },
]

function ShapeIcon({ shape }: { shape: ParticleShape }) {
  return (
    <svg width="14" height="14" viewBox="-6 -6 12 12">
      {shape === 'circle' ? (
        <circle r="4" fill="currentColor" />
      ) : (
        <path d="M -4 -3 L 2 -3 L 4 -1 L 4 3 L -4 3 Z" fill="currentColor" />
      )}
    </svg>
  )
}

export function ShapePicker({ value, onChange }: ShapePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const current = SHAPES.find((s) => s.value === value) ?? SHAPES[0]

  return (
    <div className="shape-picker nodrag" ref={ref}>
      <button
        type="button"
        className="shape-picker__trigger"
        title={current.label}
        onClick={() => setOpen((o) => !o)}
      >
        <ShapeIcon shape={current.value} />
      </button>
      {open && (
        <div className="shape-picker__menu">
          {SHAPES.map((shape) => (
            <button
              key={shape.value}
              type="button"
              className={`shape-picker__option${shape.value === value ? ' shape-picker__option--active' : ''}`}
              title={shape.label}
              onClick={() => {
                onChange(shape.value)
                setOpen(false)
              }}
            >
              <ShapeIcon shape={shape.value} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
