import { useDiagramStore } from '../store/diagramStore'

export function PresentationLegend() {
  const useCases = useDiagramStore((s) => s.useCases)
  const scenarios = useDiagramStore((s) => s.scenarios)
  const hiddenUseCaseIds = useDiagramStore((s) => s.hiddenUseCaseIds)
  const toggleUseCaseVisibility = useDiagramStore((s) => s.toggleUseCaseVisibility)
  const applyScenario = useDiagramStore((s) => s.applyScenario)

  if (useCases.length === 0) return null

  return (
    <div className="presentation-legend">
      {scenarios.length > 0 && (
        <div className="presentation-legend__scenarios">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className="presentation-legend__scenario-btn"
              onClick={() => applyScenario(scenario.id)}
            >
              {scenario.name}
            </button>
          ))}
        </div>
      )}
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
