import { useCallback, useEffect, useRef } from 'react'
import { Canvas } from './components/Canvas'
import { Sidebar } from './components/Sidebar'
import { UseCaseLegend } from './components/UseCaseLegend'
import { EdgeInspector } from './components/EdgeInspector'
import { Toolbar } from './components/Toolbar'
import { PresentationLegend } from './components/PresentationLegend'
import { useDiagramStore } from './store/diagramStore'
import { loadFromLocalStorage, saveToLocalStorage } from './utils/fileIO'

export default function App() {
  const loadDiagram = useDiagramStore((s) => s.loadDiagram)
  const presenting = useDiagramStore((s) => s.presenting)
  const setPresenting = useDiagramStore((s) => s.setPresenting)
  const theme = useDiagramStore((s) => s.theme)
  const hydrated = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = loadFromLocalStorage()
    if (saved) loadDiagram(saved)
    hydrated.current = true
  }, [loadDiagram])

  useEffect(() => {
    const unsubscribe = useDiagramStore.subscribe((state) => {
      if (!hydrated.current) return
      saveToLocalStorage(state.toDiagramFile())
    })
    return unsubscribe
  }, [])

  const exitPresentation = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setPresenting(false)
  }, [])

  const enterPresentation = useCallback(() => {
    setPresenting(true)
    rootRef.current?.requestFullscreen?.().catch(() => {})
  }, [])

  useEffect(() => {
    if (!presenting) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') exitPresentation()
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) setPresenting(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [presenting, exitPresentation])

  return (
    <div className={`app${presenting ? ' app--presenting' : ''}${theme === 'light' ? ' app--light' : ''}`} ref={rootRef}>
      {!presenting && <Toolbar onPresent={enterPresentation} />}
      <div className="app__body">
        {!presenting && <Sidebar />}
        <Canvas interactive={!presenting} />
        {!presenting && (
          <div className="app__right-panels">
            <UseCaseLegend />
            <EdgeInspector />
          </div>
        )}
        {presenting && <PresentationLegend onExit={exitPresentation} />}
      </div>
    </div>
  )
}
