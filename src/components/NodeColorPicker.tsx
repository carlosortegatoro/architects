import { ChevronDownIcon } from './Icon'

const NODE_COLORS = [
  { value: '#334155', label: 'Slate' },
  { value: '#475569', label: 'Gray' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#dc2626', label: 'Red' },
  { value: '#16a34a', label: 'Green' },
  { value: '#d97706', label: 'Amber' },
  { value: '#9333ea', label: 'Purple' },
  { value: '#0891b2', label: 'Cyan' },
]

interface NodeColorPickerProps {
  color?: string
  onChange: (color: string) => void
}

export function NodeColorPicker({ color, onChange }: NodeColorPickerProps) {
  const currentColor = color ?? ''
  const preset = NODE_COLORS.find((option) => option.value === currentColor.toLowerCase())
  const selectedValue = preset?.value ?? currentColor
  const currentLabel = preset?.label ?? (color ? `Current color (${color})` : 'Default color')

  return (
    <div
      className="node-color-picker nodrag nopan"
      title={`Change color: ${currentLabel}`}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Native selection keys must not move/delete nodes; keep diagram undo/redo available.
        if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z')) event.stopPropagation()
      }}
    >
      <span className="node-color-picker__preview" aria-hidden="true">
        <span className="node-color-picker__dot" style={{ background: color || 'currentColor' }} />
        <ChevronDownIcon />
      </span>
      <select
        aria-label="Change color"
        value={selectedValue}
        onChange={(event) => {
          if (event.target.value !== selectedValue) onChange(event.target.value)
        }}
      >
        {!preset && <option value={currentColor}>{currentLabel}</option>}
        {NODE_COLORS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}
