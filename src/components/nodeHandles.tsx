import { Position } from '@xyflow/react'
import type { HandleCounts } from '../types'

export const MIN_HANDLES = 1
export const MAX_HANDLES = 4
export const DEFAULT_HANDLE_COUNTS: HandleCounts = { top: 1, right: 1, bottom: 1, left: 1 }

export type HandleSpec = {
  id: string
  position: Position
  style?: { left?: string; top?: string }
}

function distribute(prefix: string, position: Position, count: number, axis: 'left' | 'top'): HandleSpec[] {
  if (count === 1) return [{ id: prefix, position }]
  return Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? prefix : `${prefix}-${i + 1}`,
    position,
    style: { [axis]: `${((i + 1) * 100) / (count + 1)}%` },
  }))
}

export function buildHandles(counts: HandleCounts): HandleSpec[] {
  return [
    ...distribute('top', Position.Top, counts.top, 'left'),
    ...distribute('bottom', Position.Bottom, counts.bottom, 'left'),
    ...distribute('left', Position.Left, counts.left, 'top'),
    ...distribute('right', Position.Right, counts.right, 'top'),
  ]
}

export type SideStepperProps = {
  side: keyof HandleCounts
  value: number
  onChange: (value: number) => void
}

const SIDE_LABELS: Record<keyof HandleCounts, string> = {
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
}

export function SideStepper({ side, value, onChange }: SideStepperProps) {
  return (
    <div className={`handle-stepper handle-stepper--${side} nodrag`} title={`${SIDE_LABELS[side]} connectors`}>
      <button
        className="handle-stepper__btn"
        onClick={() => onChange(Math.max(MIN_HANDLES, value - 1))}
        disabled={value <= MIN_HANDLES}
      >
        −
      </button>
      <span className="handle-stepper__value">{value}</span>
      <button
        className="handle-stepper__btn"
        onClick={() => onChange(Math.min(MAX_HANDLES, value + 1))}
        disabled={value >= MAX_HANDLES}
      >
        +
      </button>
    </div>
  )
}
