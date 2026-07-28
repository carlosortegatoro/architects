import { useMemo } from 'react'
import { useDiagramStore } from '../store/diagramStore'

export function Sidebar() {
  const allNodes = useDiagramStore((s) => s.nodes)
  const nodes = useMemo(() => allNodes.filter((n) => n.type !== 'group'), [allNodes])
  const addNode = useDiagramStore((s) => s.addNode)
  const addGroup = useDiagramStore((s) => s.addGroup)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const removeNode = useDiagramStore((s) => s.removeNode)

  return (
    <aside className="panel sidebar">
      <div className="panel__header">
        <h2>Systems</h2>
        <div className="panel__header-actions">
          <button
            className="btn btn--primary"
            onClick={() => addNode({ x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 })}
          >
            + Add system
          </button>
          <button
            className="btn"
            onClick={() => addGroup({ x: 150 + Math.random() * 100, y: 100 + Math.random() * 100 })}
          >
            + New group
          </button>
        </div>
      </div>
      <ul className="entity-list">
        {nodes.map((node) => (
          <li key={node.id} className="entity-list__item">
            <span className="entity-list__dot" style={{ background: node.data.color }} />
            <input
              className="entity-list__input"
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
            />
            <button className="entity-list__remove" onClick={() => removeNode(node.id)}>
              ✕
            </button>
          </li>
        ))}
        {nodes.length === 0 && <li className="entity-list__empty">No systems yet</li>}
      </ul>
    </aside>
  )
}
