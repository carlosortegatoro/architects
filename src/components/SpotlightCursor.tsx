import { useEffect, useState } from 'react'
import { useDiagramStore } from '../store/diagramStore'

export function SpotlightCursor() {
  const presenting = useDiagramStore((s) => s.presenting)
  const spotlightEnabled = useDiagramStore((s) => s.spotlightEnabled)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const active = presenting && spotlightEnabled

  useEffect(() => {
    if (!active) return
    function onMouseMove(e: MouseEvent) {
      setPosition({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [active])

  if (!active) return null

  return (
    <div
      className="spotlight-cursor"
      style={{ left: position.x, top: position.y }}
    />
  )
}
