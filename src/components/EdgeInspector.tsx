import { useDiagramStore } from '../store/diagramStore'

export function EdgeInspector() {
  const selectedEdgeId = useDiagramStore((s) => s.selectedEdgeId)
  const edges = useDiagramStore((s) => s.edges)
  const useCases = useDiagramStore((s) => s.useCases)
  const updateEdgeUseCases = useDiagramStore((s) => s.updateEdgeUseCases)
  const removeEdge = useDiagramStore((s) => s.removeEdge)
  const setSelectedEdge = useDiagramStore((s) => s.setSelectedEdge)

  const edge = edges.find((e) => e.id === selectedEdgeId)
  if (!edge) return null

  const assignedIds = edge.data?.useCaseIds ?? []

  function toggle(useCaseId: string) {
    const next = assignedIds.includes(useCaseId)
      ? assignedIds.filter((id) => id !== useCaseId)
      : [...assignedIds, useCaseId]
    updateEdgeUseCases(edge.id, next)
  }

  return (
    <div className="panel inspector">
      <div className="panel__header">
        <h2>Connection</h2>
        <button className="btn" onClick={() => setSelectedEdge(null)}>
          Close
        </button>
      </div>

      {useCases.length === 0 && (
        <p className="inspector__hint">Create use cases in the legend to assign them here.</p>
      )}

      <ul className="entity-list">
        {useCases.map((useCase) => (
          <li key={useCase.id} className="entity-list__item">
            <label className="inspector__checkbox">
              <input
                type="checkbox"
                checked={assignedIds.includes(useCase.id)}
                onChange={() => toggle(useCase.id)}
              />
              <span className="entity-list__dot" style={{ background: useCase.color }} />
              {useCase.name}
            </label>
          </li>
        ))}
      </ul>

      <button className="btn btn--danger" onClick={() => removeEdge(edge.id)}>
        Delete connection
      </button>
    </div>
  )
}
