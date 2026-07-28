import type { UseCase } from '../types'
import { useDiagramStore } from '../store/diagramStore'
import { ShapePicker } from './ShapePicker'

export function UseCaseLegend() {
  const useCases = useDiagramStore((s) => s.useCases)
  const addUseCase = useDiagramStore((s) => s.addUseCase)
  const updateUseCase = useDiagramStore((s) => s.updateUseCase)
  const removeUseCase = useDiagramStore((s) => s.removeUseCase)

  return (
    <div className="panel legend">
      <div className="panel__header">
        <h2>Use cases</h2>
        <button className="btn btn--primary" onClick={addUseCase}>
          + New
        </button>
      </div>
      <ul className="entity-list">
        {useCases.map((useCase) => (
          <li key={useCase.id} className="entity-list__item">
            <input
              type="color"
              className="entity-list__color"
              value={useCase.color}
              onChange={(e) => updateUseCase(useCase.id, { color: e.target.value })}
            />
            <input
              className="entity-list__input"
              value={useCase.name}
              onChange={(e) => updateUseCase(useCase.id, { name: e.target.value })}
            />
            <select
              className="entity-list__select"
              value={useCase.speed}
              onChange={(e) =>
                updateUseCase(useCase.id, {
                  speed: e.target.value as UseCase['speed'],
                })
              }
            >
              <option value="real-time">Real-time</option>
              <option value="near-real-time">Near real-time</option>
              <option value="batch">Batch</option>
              <option value="zero-copy">Zero-copy</option>
              <option value="none">None</option>
            </select>
            <ShapePicker
              value={useCase.shape}
              onChange={(shape) => updateUseCase(useCase.id, { shape })}
            />
            <button className="entity-list__remove" onClick={() => removeUseCase(useCase.id)}>
              ✕
            </button>
          </li>
        ))}
        {useCases.length === 0 && <li className="entity-list__empty">No use cases yet</li>}
      </ul>
    </div>
  )
}
