import { useEffect, useState } from 'react'
import { Handle, NodeResizer, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react'
import type { AnnotationNodeData, HandleCounts } from '../types'
import { useDiagramStore } from '../store/diagramStore'
import { NodeColorPicker } from './NodeColorPicker'
import { buildHandles, DEFAULT_HANDLE_COUNTS, SideStepper } from './nodeHandles'

type AnnotationNodeType = Node<AnnotationNodeData>

const MIN_WIDTH = 160
const MIN_HEIGHT = 80

export function AnnotationNode({ id, data, selected, width, height }: NodeProps<AnnotationNodeType>) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const removeNode = useDiagramStore((s) => s.removeNode)
  const presenting = useDiagramStore((s) => s.presenting)
  const updateNodeInternals = useUpdateNodeInternals()

  const counts = data.handleCounts ?? DEFAULT_HANDLE_COUNTS
  const handles = buildHandles(counts)

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, width, height, counts.top, counts.right, counts.bottom, counts.left, updateNodeInternals])

  function setSideCount(side: keyof HandleCounts, value: number) {
    updateNodeData(id, { handleCounts: { ...counts, [side]: value } })
  }

  return (
    <div className="annotation-box" style={{ borderColor: data.color }}>
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
          <div className="node-header-actions nodrag">
            <NodeColorPicker color={data.color} onChange={(color) => updateNodeData(id, { color })} />
            <button className="annotation-box__delete nodrag" onClick={() => removeNode(id)} title="Delete annotation">
              ✕
            </button>
          </div>
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
    </div>
  )
}
