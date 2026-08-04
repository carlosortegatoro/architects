import { useEffect } from 'react'
import { useDiagramStore } from '../store/diagramStore'

const POLL_MS = 4000

export function useRemoteSync() {
  const diagramId = useDiagramStore((s) => s.diagramId)
  const presenting = useDiagramStore((s) => s.presenting)

  useEffect(() => {
    if (!diagramId || presenting) return
    const interval = setInterval(() => {
      useDiagramStore.getState().checkRemoteVersion()
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [diagramId, presenting])
}
