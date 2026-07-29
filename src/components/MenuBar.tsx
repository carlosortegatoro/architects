import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDiagramStore } from '../store/diagramStore'
import { useAuthStore } from '../store/authStore'
import { diagramsApi } from '../api/client'
import { downloadDiagram, parseDiagramFile } from '../utils/fileIO'
import {
  ChevronDownIcon,
  DownloadIcon,
  FolderIcon,
  MoonIcon,
  PaperPlaneIcon,
  PlayIcon,
  SunIcon,
  UploadIcon,
  UserIcon,
} from './Icon'
import { ShareDialog } from './ShareDialog'
import { EditableTitle } from './EditableTitle'

type MenuBarProps = {
  onPresent: () => void
  onOpenPicker: () => void
}

export function MenuBar({ onPresent, onOpenPicker }: MenuBarProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  const toDiagramFile = useDiagramStore((s) => s.toDiagramFile)
  const loadDiagram = useDiagramStore((s) => s.loadDiagram)
  const theme = useDiagramStore((s) => s.theme)
  const toggleTheme = useDiagramStore((s) => s.toggleTheme)
  const diagramId = useDiagramStore((s) => s.diagramId)
  const diagramName = useDiagramStore((s) => s.diagramName)
  const renameDiagram = useDiagramStore((s) => s.renameDiagram)
  const isDirty = useDiagramStore((s) => s.isDirty)
  const isSaving = useDiagramStore((s) => s.isSaving)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [accountOpen, setAccountOpen] = useState(false)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    if (!accountOpen && !fileMenuOpen) return
    function onMouseDown(e: MouseEvent) {
      if (accountOpen && accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
      if (fileMenuOpen && fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [accountOpen, fileMenuOpen])

  function handleExport() {
    downloadDiagram(toDiagramFile())
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    try {
      loadDiagram(parseDiagramFile(text))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not import file')
    }
  }

  async function handleDuplicate() {
    if (!diagramId) return
    setFileMenuOpen(false)
    const duplicate = await diagramsApi.duplicate(diagramId)
    navigate(`/d/${duplicate.id}`)
  }

  async function handleDelete() {
    if (!diagramId) return
    setFileMenuOpen(false)
    if (!confirm(`Delete "${diagramName}"? This cannot be undone.`)) return
    await diagramsApi.remove(diagramId)
    navigate('/')
  }

  return (
    <div className="toolbar">
      <div className="toolbar__filemenu" ref={fileMenuRef}>
        <button className="btn" onClick={() => setFileMenuOpen((v) => !v)}>
          <FolderIcon />
          File
          <ChevronDownIcon />
        </button>
        {fileMenuOpen && (
          <div className="toolbar__filemenu-menu">
            <button
              className="toolbar__filemenu-item"
              onClick={() => {
                setFileMenuOpen(false)
                onOpenPicker()
              }}
            >
              New diagram
            </button>
            <button
              className="toolbar__filemenu-item"
              onClick={() => {
                setFileMenuOpen(false)
                onOpenPicker()
              }}
            >
              Open…
            </button>
            <button className="toolbar__filemenu-item" onClick={handleDuplicate} disabled={!diagramId}>
              Duplicate
            </button>
            <button className="toolbar__filemenu-item" onClick={handleDelete} disabled={!diagramId}>
              Delete
            </button>
            <div className="toolbar__filemenu-separator" />
            <button
              className="toolbar__filemenu-item"
              onClick={() => {
                setFileMenuOpen(false)
                handleExport()
              }}
            >
              <DownloadIcon />
              Export JSON
            </button>
            <button
              className="toolbar__filemenu-item"
              onClick={() => {
                setFileMenuOpen(false)
                fileInputRef.current?.click()
              }}
            >
              <UploadIcon />
              Import JSON
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImportFile(file)
            e.target.value = ''
          }}
        />
      </div>

      <div className="toolbar__title-group">
        {diagramId && <EditableTitle value={diagramName} onCommit={renameDiagram} />}
        {diagramId && (
          <span className="toolbar__save-indicator">
            {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
        )}
      </div>

      <div className="toolbar__actions">
        <button className="btn btn--primary" onClick={onPresent}>
          <PlayIcon />
          Present
        </button>
        <button className="btn" onClick={() => setShareOpen(true)} disabled={!diagramId}>
          <PaperPlaneIcon />
          Share
        </button>

        <div className="toolbar__account" ref={accountRef}>
          <button className="toolbar__theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button
            className="toolbar__avatar"
            onClick={() => setAccountOpen((v) => !v)}
            aria-label="Account menu"
          >
            <UserIcon />
          </button>
          {accountOpen && (
            <div className="toolbar__account-menu">
              <span className="toolbar__account-email">{user?.email}</span>
              <button className="btn" onClick={() => logout()}>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
      {shareOpen && diagramId && <ShareDialog diagramId={diagramId} onClose={() => setShareOpen(false)} />}
    </div>
  )
}
