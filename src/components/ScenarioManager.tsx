import { useDiagramStore } from '../store/diagramStore'
import { PlusIcon } from './Icon'

export function ScenarioManager() {
  const scenarios = useDiagramStore((s) => s.scenarios)
  const useCases = useDiagramStore((s) => s.useCases)
  const addScenario = useDiagramStore((s) => s.addScenario)
  const updateScenario = useDiagramStore((s) => s.updateScenario)
  const removeScenario = useDiagramStore((s) => s.removeScenario)

  if (useCases.length === 0) return null

  return (
    <div className="panel legend">
      <div className="panel__header">
        <h2>Scenarios</h2>
        <button
          type="button"
          className="btn btn--primary btn--icon"
          title="New scenario"
          data-tooltip="New Scenario"
          onClick={addScenario}
        >
          <PlusIcon />
        </button>
      </div>
      <ul className="entity-list">
        {scenarios.map((scenario) => (
          <li key={scenario.id} className="scenario-item">
            <div className="entity-list__item">
              <input
                className="entity-list__input"
                value={scenario.name}
                onChange={(e) => updateScenario(scenario.id, { name: e.target.value })}
              />
              <button className="entity-list__remove" onClick={() => removeScenario(scenario.id)}>
                ✕
              </button>
            </div>
            <ul className="scenario-item__use-cases">
              {useCases.map((useCase) => (
                <li key={useCase.id} className="scenario-item__use-case">
                  <label>
                    <input
                      type="checkbox"
                      checked={scenario.useCaseIds.includes(useCase.id)}
                      onChange={(e) =>
                        updateScenario(scenario.id, {
                          useCaseIds: e.target.checked
                            ? [...scenario.useCaseIds, useCase.id]
                            : scenario.useCaseIds.filter((id) => id !== useCase.id),
                        })
                      }
                    />
                    <span className="scenario-item__dot" style={{ background: useCase.color }} />
                    {useCase.name}
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
        {scenarios.length === 0 && <li className="entity-list__empty">No scenarios yet</li>}
      </ul>
    </div>
  )
}
