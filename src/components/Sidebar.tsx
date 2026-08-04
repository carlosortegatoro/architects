import { useMemo } from 'react'
import { useDiagramStore } from '../store/diagramStore'
import { AsteriskIcon, ShapeFullIcon, ShapeLogoOnlyIcon, ShapeTextOnlyIcon } from './Icon'

const SHAPE_BUTTONS: { mode: 'full' | 'logoOnly' | 'textOnly'; icon: JSX.Element; title: string }[] = [
  { mode: 'full', icon: <ShapeFullIcon />, title: 'New system (full)' },
  { mode: 'logoOnly', icon: <ShapeLogoOnlyIcon />, title: 'New system (logo only)' },
  { mode: 'textOnly', icon: <ShapeTextOnlyIcon />, title: 'New system (text only)' },
]

export function Sidebar() {
  const allNodes = useDiagramStore((s) => s.nodes)
  const nodes = useMemo(() => allNodes.filter((n) => n.type !== 'group'), [allNodes])
  const addNode = useDiagramStore((s) => s.addNode)
  const addGroup = useDiagramStore((s) => s.addGroup)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const removeNode = useDiagramStore((s) => s.removeNode)
  const setFocusedNode = useDiagramStore((s) => s.setFocusedNode)

  return (
    <aside className="panel sidebar">
      <div className="panel__header">
        <h2>Shapes</h2>
        <div className="panel__header-actions">
          <button
            type="button"
            className="btn btn--icon"
            title="New group"
            data-tooltip="New Group"
            onClick={() => addGroup({ x: 150 + Math.random() * 100, y: 100 + Math.random() * 100 })}
          >
            <AsteriskIcon />
          </button>
        </div>
      </div>
      <div className="shapes-toolbox">
        {SHAPE_BUTTONS.map(({ mode, icon, title }) => (
          <button
            key={mode}
            type="button"
            className="shapes-toolbox__btn"
            title={title}
            onClick={() => addNode({ x: 200 + Math.random() * 100, y: 150 + Math.random() * 100 }, mode)}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="panel__header">
        <h2>Systems</h2>
      </div>
      <ul className="entity-list">
        {nodes.map((node) => (
          <li key={node.id} className="entity-list__item">
            <span className="entity-list__dot" style={{ background: node.data.color }} />
            <input
              className="entity-list__input"
              value={node.data.label}
              onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
              onFocus={() => setFocusedNode(node.id)}
              onBlur={() => setFocusedNode(null)}
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
