import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlignmentToolbar } from './components/AlignmentToolbar'
import { Canvas } from './components/Canvas'
import { Sidebar } from './components/Sidebar'
import { UseCaseLegend } from './components/UseCaseLegend'
import { ScenarioManager } from './components/ScenarioManager'
import { EdgeInspector } from './components/EdgeInspector'
import { MenuBar } from './components/MenuBar'
import { PresentationLegend } from './components/PresentationLegend'
import { PresentationControls } from './components/PresentationControls'
import { SpotlightCursor } from './components/SpotlightCursor'
import { DiagramPickerModal } from './components/DiagramPickerModal'
import { useDiagramStore } from './store/diagramStore'
import { useAutosave } from './hooks/useAutosave'
import { useRemoteSync } from './hooks/useRemoteSync'

export default function App() {
  const { diagramId: routeDiagramId } = useParams<{ diagramId: string }>()
  const navigate = useNavigate()
  const openDiagram = useDiagramStore((s) => s.openDiagram)
  const closeDiagram = useDiagramStore((s) => s.closeDiagram)
  const saveDiagram = useDiagramStore((s) => s.saveDiagram)
  const reloadFromRemote = useDiagramStore((s) => s.reloadFromRemote)
  const currentDiagramId = useDiagramStore((s) => s.diagramId)
  const isLoading = useDiagramStore((s) => s.isLoading)
  const loadError = useDiagramStore((s) => s.loadError)
  const presenting = useDiagramStore((s) => s.presenting)
  const setPresenting = useDiagramStore((s) => s.setPresenting)
  const undo = useDiagramStore((s) => s.undo)
  const redo = useDiagramStore((s) => s.redo)
  const theme = useDiagramStore((s) => s.theme)
  const diagramName = useDiagramStore((s) => s.diagramName)
  const remoteChangeAvailable = useDiagramStore((s) => s.remoteChangeAvailable)
  const isDirty = useDiagramStore((s) => s.isDirty)
  const rootRef = useRef<HTMLDivElement>(null)
  const [pickerOpen, setPickerOpen] = useState(!routeDiagramId)
  const pendingCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useAutosave()
  useRemoteSync()

  useEffect(() => {
    document.title = diagramName ? `${diagramName} — Architectures` : 'Architectures'
  }, [diagramName])

  useEffect(() => {
    if (pendingCloseRef.current) {
      clearTimeout(pendingCloseRef.current)
      pendingCloseRef.current = null
    }

    if (!routeDiagramId) {
      setPickerOpen(true)
      return
    }
    setPickerOpen(false)
    openDiagram(routeDiagramId)
    return () => {
      saveDiagram()
      pendingCloseRef.current = setTimeout(() => {
        pendingCloseRef.current = null
        closeDiagram()
      }, 0)
    }
  }, [routeDiagramId, openDiagram, closeDiagram, saveDiagram])

  function handleOpenDiagram(id: string) {
    setPickerOpen(false)
    navigate(`/d/${id}`)
  }

  const exitPresentation = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setPresenting(false)
  }, [])

  const enterPresentation = useCallback(() => {
    setPresenting(true)
  }, [])

  const enterFullscreen = useCallback(() => {
    rootRef.current?.requestFullscreen?.().catch(() => {})
  }, [])

  useEffect(() => {
    if (!presenting) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') exitPresentation()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [presenting, exitPresentation])

  useEffect(() => {
    if (presenting) return
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [presenting, undo, redo])

  if (loadError) {
    return (
      <div className="app__load-error">
        <p>{loadError}</p>
        <button className="btn" onClick={() => { closeDiagram(); navigate('/'); setPickerOpen(true) }}>
          Back to diagrams
        </button>
      </div>
    )
  }

  if (routeDiagramId && isLoading) return <div className="app__loading">Loading…</div>

  return (
    <div className={`app${presenting ? ' app--presenting' : ''}${theme === 'light' ? ' app--light' : ''}`} ref={rootRef}>
      {!presenting && <MenuBar onPresent={enterPresentation} onOpenPicker={() => setPickerOpen(true)} />}
      {!presenting && remoteChangeAvailable && isDirty && (
        <div className="remote-change-banner">
          <span>Hay cambios nuevos guardados por el agente MCP.</span>
          <button className="btn" onClick={reloadFromRemote}>Recargar cambios del agente</button>
        </div>
      )}
      <div className="app__body">
        {!presenting && <Sidebar />}
        <Canvas interactive={!presenting && !pickerOpen} />
        {!presenting && <AlignmentToolbar />}
        {!presenting && (
          <div className="app__right-panels">
            <UseCaseLegend />
            <ScenarioManager />
            <EdgeInspector />
          </div>
        )}
        {presenting && (
          <>
            <PresentationLegend />
            <PresentationControls onExpand={enterFullscreen} onExit={exitPresentation} />
            <SpotlightCursor />
          </>
        )}
      </div>
      {pickerOpen && (
        <DiagramPickerModal
          onOpenDiagram={handleOpenDiagram}
          onDismiss={currentDiagramId ? () => setPickerOpen(false) : undefined}
          onDeleteCurrent={() => navigate('/')}
          currentDiagramId={currentDiagramId}
        />
      )}
    </div>
  )
}
