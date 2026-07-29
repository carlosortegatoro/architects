import { ShareIcon } from './Icon'

type PresentationControlsProps = {
  onExpand: () => void
  onExit: () => void
}

export function PresentationControls({ onExpand, onExit }: PresentationControlsProps) {
  return (
    <div className="presentation-controls">
      <button className="presentation-controls__btn" onClick={onExpand} title="Fullscreen">
        <ShareIcon />
      </button>
      <button className="presentation-controls__btn" onClick={onExit} title="Exit (Esc)">
        ✕
      </button>
    </div>
  )
}
