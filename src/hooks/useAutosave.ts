import { useEffect, useRef } from 'react'
import { useDiagramStore } from '../store/diagramStore'

const DEBOUNCE_MS = 5000
const MAX_WAIT_MS = 10000

export function useAutosave() {
  const isDirty = useDiagramStore((s) => s.isDirty)
  const isSaving = useDiagramStore((s) => s.isSaving)
  const remoteChangeAvailable = useDiagramStore((s) => s.remoteChangeAvailable)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstDirtyAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isDirty || isSaving || remoteChangeAvailable) {
      firstDirtyAtRef.current = null
      return
    }

    if (firstDirtyAtRef.current === null) firstDirtyAtRef.current = Date.now()

    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    const elapsed = Date.now() - firstDirtyAtRef.current
    const wait = Math.min(DEBOUNCE_MS, Math.max(0, MAX_WAIT_MS - elapsed))

    timeoutRef.current = setTimeout(() => {
      firstDirtyAtRef.current = null
      useDiagramStore.getState().saveDiagram()
    }, wait)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [isDirty, isSaving, remoteChangeAvailable])

  useEffect(() => {
    function flush() {
      if (useDiagramStore.getState().isDirty) useDiagramStore.getState().saveDiagram()
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])
}
