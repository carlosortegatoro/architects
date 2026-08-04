import { useEffect, useState } from 'react'
import { Handle, NodeResizer, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react'
import type { HandleCounts, SystemNodeData } from '../types'
import { useDiagramStore } from '../store/diagramStore'
import { IconPicker } from './IconPicker'
import { resolveIconSrc } from '../config/presetLogos'
import { buildHandles, DEFAULT_HANDLE_COUNTS, SideStepper } from './nodeHandles'

type SystemBoxNodeType = Node<SystemNodeData>

const BOX_COLORS = ['#334155', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2']

const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 110
const COMPACT_SIZE = 90

export function SystemBoxNode({ id, data, selected }: NodeProps<SystemBoxNodeType>) {
  const [editing, setEditing] = useState(false)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const removeNode = useDiagramStore((s) => s.removeNode)
  const presenting = useDiagramStore((s) => s.presenting)
  const focusedNodeId = useDiagramStore((s) => s.focusedNodeId)
  const highlightedNodeIds = useDiagramStore((s) => s.highlightedNodeIds)
  const updateNodeInternals = useUpdateNodeInternals()

  const counts = data.handleCounts ?? DEFAULT_HANDLE_COUNTS
  const handles = buildHandles(counts)

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, counts.top, counts.right, counts.bottom, counts.left, updateNodeInternals])

  function setSideCount(side: keyof HandleCounts, value: number) {
    updateNodeData(id, { handleCounts: { ...counts, [side]: value } })
  }

  const isCompact = presenting && !data.label.trim()
  const isLogoOnly = data.displayMode === 'logoOnly'
  const isTextOnly = data.displayMode === 'textOnly'
  const isFocused = editing || focusedNodeId === id
  const isHighlighted = presenting && highlightedNodeIds.includes(id)
  const isDimmed = presenting && highlightedNodeIds.length > 0 && !isHighlighted

  return (
    <div
      className={`system-box${selected ? ' system-box--selected' : ''}${(isCompact || isLogoOnly) ? ' system-box--compact' : ''}${isFocused ? ' system-box--focused' : ''}${isHighlighted ? ' system-box--highlighted' : ''}${isDimmed ? ' system-box--dimmed' : ''}`}
      style={{
        borderColor: data.color,
        ...(isCompact || isLogoOnly ? { width: COMPACT_SIZE, height: COMPACT_SIZE } : {}),
      }}
    >
      <NodeResizer
        isVisible={selected && !presenting}
        minWidth={isCompact || isLogoOnly ? COMPACT_SIZE : DEFAULT_WIDTH}
        minHeight={isCompact || isLogoOnly ? COMPACT_SIZE : DEFAULT_HEIGHT}
      />

      {selected && !presenting && (
        <>
          <SideStepper side="top" value={counts.top} onChange={(v) => setSideCount('top', v)} />
          <SideStepper side="right" value={counts.right} onChange={(v) => setSideCount('right', v)} />
          <SideStepper side="bottom" value={counts.bottom} onChange={(v) => setSideCount('bottom', v)} />
          <SideStepper side="left" value={counts.left} onChange={(v) => setSideCount('left', v)} />
        </>
      )}

      {handles.map((h) => (
        <Handle key={h.id} type="source" position={h.position} id={h.id} style={h.style} />
      ))}

      <div className="system-box__main">
        {!isTextOnly && (
          presenting ? (
            <div className="system-box__icon system-box__icon--static">
              {data.icon && <img src={resolveIconSrc(data.icon)} alt="" />}
            </div>
          ) : (
            <IconPicker
              icon={data.icon}
              onChange={(icon) => updateNodeData(id, { icon })}
              triggerClassName="system-box__icon"
              placeholderClassName="system-box__icon-placeholder"
            />
          )
        )}

        {!isCompact && !isLogoOnly && (
          <div className="system-box__body" onDoubleClick={() => setEditing(true)}>
            {editing ? (
              <input
                autoFocus
                className="system-box__input nodrag"
                defaultValue={data.label}
                onBlur={(e) => {
                  updateNodeData(id, { label: e.target.value })
                  setEditing(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditing(false)
                }}
              />
            ) : (
              <div className="system-box__label">{data.label}</div>
            )}
            {!isTextOnly && <div className="system-box__underline" style={{ background: data.color }} />}
          </div>
        )}
      </div>

      {!presenting && (
        <div className="system-box__actions nodrag">
          {BOX_COLORS.map((color) => (
            <button
              key={color}
              className="system-box__swatch"
              style={{ background: color }}
              onClick={() => updateNodeData(id, { color })}
              title="Change color"
            />
          ))}
          <button className="system-box__delete nodrag" onClick={() => removeNode(id)} title="Delete">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
