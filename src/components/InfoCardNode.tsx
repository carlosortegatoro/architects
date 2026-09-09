import { useEffect, useState } from 'react'
import { Handle, NodeResizer, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react'
import type { HandleCounts, InfoCardNodeData } from '../types'
import { resolveIconSrc } from '../config/presetLogos'
import { useDiagramStore } from '../store/diagramStore'
import { IconPicker } from './IconPicker'
import { buildHandles, DEFAULT_HANDLE_COUNTS, SideStepper } from './nodeHandles'

type InfoCardNodeType = Node<InfoCardNodeData>

const MIN_WIDTH = 240
const MIN_HEIGHT = 140
const CARD_COLORS = ['#334155', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2']

export function InfoCardNode({ id, data, selected, width, height }: NodeProps<InfoCardNodeType>) {
  const [editingHeader, setEditingHeader] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const removeNode = useDiagramStore((s) => s.removeNode)
  const presenting = useDiagramStore((s) => s.presenting)
  const highlightedNodeIds = useDiagramStore((s) => s.highlightedNodeIds)
  const updateNodeInternals = useUpdateNodeInternals()

  const counts = data.handleCounts ?? DEFAULT_HANDLE_COUNTS
  const handles = buildHandles(counts)
  const isHighlighted = presenting && highlightedNodeIds.includes(id)
  const isDimmed = presenting && highlightedNodeIds.length > 0 && !isHighlighted

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, width, height, counts.top, counts.right, counts.bottom, counts.left, updateNodeInternals])

  function setSideCount(side: keyof HandleCounts, value: number) {
    updateNodeData(id, { handleCounts: { ...counts, [side]: value } })
  }

  return (
    <div
      className={`info-card${selected ? ' info-card--selected' : ''}${isHighlighted ? ' info-card--highlighted' : ''}${isDimmed ? ' info-card--dimmed' : ''}`}
      style={{ borderColor: data.color }}
    >
      <NodeResizer isVisible={selected && !presenting} minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} />

      {selected && !presenting && (
        <>
          <SideStepper side="top" value={counts.top} onChange={(value) => setSideCount('top', value)} />
          <SideStepper side="right" value={counts.right} onChange={(value) => setSideCount('right', value)} />
          <SideStepper side="bottom" value={counts.bottom} onChange={(value) => setSideCount('bottom', value)} />
          <SideStepper side="left" value={counts.left} onChange={(value) => setSideCount('left', value)} />
        </>
      )}

      {handles.map((handle) => (
        <Handle key={handle.id} type="source" position={handle.position} id={handle.id} style={handle.style} />
      ))}

      <div className="info-card__header" style={{ borderBottomColor: data.color }}>
        {presenting ? (
          <div className="info-card__icon info-card__icon--static">
            {data.icon && <img src={resolveIconSrc(data.icon)} alt="" />}
          </div>
        ) : (
          <IconPicker
            icon={data.icon}
            onChange={(icon) => updateNodeData(id, { icon })}
            triggerClassName="info-card__icon"
            placeholderClassName="info-card__icon-placeholder"
          />
        )}

        <div className="info-card__heading nodrag" onDoubleClick={() => setEditingHeader(true)}>
          {editingHeader ? (
            <input
              autoFocus
              className="info-card__heading-input"
              defaultValue={data.header}
              onBlur={(event) => {
                updateNodeData(id, { header: event.target.value.trim() || 'Information card' })
                setEditingHeader(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') setEditingHeader(false)
              }}
            />
          ) : (
            <div className="info-card__heading-text">{data.header}</div>
          )}
        </div>

        {!presenting && (
          <button className="info-card__delete nodrag" type="button" onClick={() => removeNode(id)} title="Delete information card">
            ✕
          </button>
        )}
      </div>

      <div className="info-card__description nodrag" onDoubleClick={() => setEditingDescription(true)}>
        {editingDescription ? (
          <textarea
            autoFocus
            className="info-card__description-input"
            defaultValue={data.description}
            onBlur={(event) => {
              updateNodeData(id, { description: event.target.value })
              setEditingDescription(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditingDescription(false)
            }}
          />
        ) : (
          <div className="info-card__description-text">{data.description || 'Add a description'}</div>
        )}
      </div>

      {!presenting && (
        <div className="info-card__actions nodrag">
          {CARD_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="info-card__swatch"
              style={{ background: color }}
              onClick={() => updateNodeData(id, { color })}
              title="Change color"
            />
          ))}
        </div>
      )}
    </div>
  )
}
