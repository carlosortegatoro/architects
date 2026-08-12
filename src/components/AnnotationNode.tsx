import { useState } from 'react'
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react'
import type { AnnotationNodeData } from '../types'
import { useDiagramStore } from '../store/diagramStore'

type AnnotationNodeType = Node<AnnotationNodeData>

const MIN_WIDTH = 160
const MIN_HEIGHT = 80

const ANNOTATION_COLORS = ['#334155', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2']

export function AnnotationNode({ id, data, selected }: NodeProps<AnnotationNodeType>) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const removeNode = useDiagramStore((s) => s.removeNode)
  const presenting = useDiagramStore((s) => s.presenting)

  return (
    <div className="annotation-box" style={{ borderColor: data.color }}>
      <NodeResizer isVisible={selected && !presenting} minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} />

      <div className="annotation-box__header nodrag" onDoubleClick={() => setEditingTitle(true)}>
        {editingTitle ? (
          <input
            autoFocus
            className="annotation-box__input"
            defaultValue={data.title}
            onBlur={(e) => {
              updateNodeData(id, { title: e.target.value || 'New note' })
              setEditingTitle(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditingTitle(false)
            }}
          />
        ) : (
          <span className="annotation-box__title">{data.title}</span>
        )}
        {!presenting && (
          <button className="annotation-box__delete nodrag" onClick={() => removeNode(id)} title="Delete annotation">
            ✕
          </button>
        )}
      </div>

      <div className="annotation-box__body nodrag" onDoubleClick={() => setEditingBody(true)}>
        {editingBody ? (
          <textarea
            autoFocus
            className="annotation-box__textarea"
            defaultValue={data.body ?? ''}
            onBlur={(e) => {
              updateNodeData(id, { body: e.target.value })
              setEditingBody(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditingBody(false)
            }}
          />
        ) : data.body ? (
          <span className="annotation-box__body-text">{data.body}</span>
        ) : (
          <span className="annotation-box__body-placeholder">Add a description…</span>
        )}
      </div>

      {!presenting && (
        <div className="annotation-box__actions nodrag">
          {ANNOTATION_COLORS.map((color) => (
            <button
              key={color}
              className="annotation-box__swatch"
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
