import { useDiagramStore } from '../store/diagramStore'
import { PauseIcon, PlayIcon, ShareIcon, SpotlightIcon } from './Icon'

type PresentationControlsProps = {
  onExpand: () => void
  onExit: () => void
}

export function PresentationControls({ onExpand, onExit }: PresentationControlsProps) {
  const spotlightEnabled = useDiagramStore((s) => s.spotlightEnabled)
  const toggleSpotlight = useDiagramStore((s) => s.toggleSpotlight)
  const particlesPaused = useDiagramStore((s) => s.particlesPaused)
  const toggleParticlesPause = useDiagramStore((s) => s.toggleParticlesPause)

  return (
    <div className="presentation-controls">
      <button
        className={`presentation-controls__btn${spotlightEnabled ? ' presentation-controls__btn--active' : ''}`}
        onClick={toggleSpotlight}
        title="Toggle spotlight"
      >
        <SpotlightIcon />
      </button>
      <button
        className={`presentation-controls__btn${particlesPaused ? ' presentation-controls__btn--active' : ''}`}
        onClick={toggleParticlesPause}
        title={particlesPaused ? 'Resume particles' : 'Pause particles'}
      >
        {particlesPaused ? <PlayIcon /> : <PauseIcon />}
      </button>
      <button className="presentation-controls__btn" onClick={onExpand} title="Fullscreen">
        <ShareIcon />
      </button>
      <button className="presentation-controls__btn" onClick={onExit} title="Exit (Esc)">
        ✕
      </button>
    </div>
  )
}
