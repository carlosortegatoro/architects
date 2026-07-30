import { useEffect, useState } from 'react'
import { Handle, NodeResizer, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react'
import type { GroupNodeData, HandleCounts } from '../types'
import { useDiagramStore } from '../store/diagramStore'
import { IconPicker } from './IconPicker'
import { resolveIconSrc } from '../config/presetLogos'
import { buildHandles, DEFAULT_HANDLE_COUNTS, SideStepper } from './nodeHandles'

type GroupNodeType = Node<GroupNodeData>

const DEFAULT_WIDTH = 240
const DEFAULT_HEIGHT = 160

export function GroupNode({ id, data, selected }: NodeProps<GroupNodeType>) {
  const [editing, setEditing] = useState(false)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const removeNode = useDiagramStore((s) => s.removeNode)
  const presenting = useDiagramStore((s) => s.presenting)
  const isDropTarget = useDiagramStore((s) => s.dropTargetGroupId === id)
  const updateNodeInternals = useUpdateNodeInternals()

  const counts = data.handleCounts ?? DEFAULT_HANDLE_COUNTS
  const handles = buildHandles(counts)

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, counts.top, counts.right, counts.bottom, counts.left, updateNodeInternals])

  function setSideCount(side: keyof HandleCounts, value: number) {
    updateNodeData(id, { handleCounts: { ...counts, [side]: value } })
  }

  return (
    <div
      className={`group-box${isDropTarget ? ' group-box--drop-target' : ''}`}
      style={{ borderColor: data.color }}
    >
      <NodeResizer
        isVisible={selected && !presenting}
        minWidth={DEFAULT_WIDTH}
        minHeight={DEFAULT_HEIGHT}
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

      <div
        className="group-box__header nodrag"
        style={{ background: data.color }}
        onDoubleClick={() => setEditing(true)}
      >
        {presenting ? (
          data.icon && (
            <div className="group-box__icon group-box__icon--static">
              <img src={resolveIconSrc(data.icon)} alt="" />
            </div>
          )
        ) : (
          <IconPicker
            icon={data.icon}
            onChange={(icon) => updateNodeData(id, { icon })}
            triggerClassName="group-box__icon"
            placeholderClassName="group-box__icon-placeholder"
          />
        )}

        {editing ? (
          <input
            autoFocus
            className="group-box__input"
            defaultValue={data.label}
            onBlur={(e) => {
              updateNodeData(id, { label: e.target.value || 'Group' })
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span className="group-box__label">{data.label}</span>
        )}
        {!presenting && (
          <button className="group-box__delete nodrag" onClick={() => removeNode(id)} title="Delete group">
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
