import { useDiagramStore } from '../store/diagramStore'

export function PresentationLegend() {
  const useCases = useDiagramStore((s) => s.useCases)
  const hiddenUseCaseIds = useDiagramStore((s) => s.hiddenUseCaseIds)
  const toggleUseCaseVisibility = useDiagramStore((s) => s.toggleUseCaseVisibility)

  if (useCases.length === 0) return null

  return (
    <div className="presentation-legend">
      <div className="presentation-legend__header">
        <span>Use cases</span>
      </div>
      <ul className="presentation-legend__list">
        {useCases.map((useCase) => (
          <li key={useCase.id} className="presentation-legend__item">
            <input
              type="checkbox"
              checked={!hiddenUseCaseIds.includes(useCase.id)}
              onChange={() => toggleUseCaseVisibility(useCase.id)}
            />
            <span className="presentation-legend__dot" style={{ background: useCase.color }} />
            {useCase.name}
          </li>
        ))}
      </ul>
    </div>
  )
}
