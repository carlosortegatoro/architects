import { useEffect, useMemo, useState } from 'react'
import { diagramsApi, type DiagramSummary } from '../api/client'
import { STORAGE_KEY, loadFromLocalStorage } from '../utils/fileIO'
import { FolderIcon, CopyIcon, TrashIcon } from './Icon'

type DiagramPickerModalProps = {
  onOpenDiagram: (id: string) => void
  onDismiss?: () => void
  onDeleteCurrent?: () => void
  currentDiagramId?: string | null
}

type SortMode = 'name' | 'date'

export function DiagramPickerModal({
  onOpenDiagram,
  onDismiss,
  onDeleteCurrent,
  currentDiagramId,
}: DiagramPickerModalProps) {
  const [diagrams, setDiagrams] = useState<DiagramSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offerImport, setOfferImport] = useState(false)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('date')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function refresh() {
    try {
      const list = await diagramsApi.list()
      setDiagrams(list)
      if (list.length === 0 && loadFromLocalStorage()) setOfferImport(true)
    } catch {
      setError('Could not load your diagrams')
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    const dismiss = onDismiss
    if (!dismiss) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  async function handleImportLocal() {
    const content = loadFromLocalStorage()
    setOfferImport(false)
    if (!content) return
    const diagram = await diagramsApi.create('Imported diagram')
    await diagramsApi.update(diagram.id, { content })
    localStorage.removeItem(STORAGE_KEY)
    onOpenDiagram(diagram.id)
  }

  async function handleCreate() {
    const name = prompt('Name for the new diagram:', 'Untitled diagram')
    if (!name) return
    const diagram = await diagramsApi.create(name)
    onOpenDiagram(diagram.id)
  }

  async function handleDuplicate(id: string) {
    await diagramsApi.duplicate(id)
    refresh()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    if (selectedId === id) setSelectedId(null)
    await diagramsApi.remove(id)
    if (id === currentDiagramId) onDeleteCurrent?.()
    refresh()
  }

  const visibleDiagrams = useMemo(() => {
    if (!diagrams) return null
    const filtered = query.trim()
      ? diagrams.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()))
      : diagrams
    return [...filtered].sort((a, b) =>
      sortMode === 'name'
        ? a.name.localeCompare(b.name)
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  }, [diagrams, query, sortMode])

  const selected = diagrams?.find((d) => d.id === selectedId) ?? null

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onDismiss?.() }}>
      <div className="modal picker">
        <header className="picker__header">
          <h1>My diagrams</h1>
          {onDismiss && (
            <button className="btn modal__close" onClick={onDismiss} aria-label="Close">
              ✕
            </button>
          )}
        </header>

        <div className="picker__toolbar">
          <div className="picker__search">
            <input
              type="text"
              placeholder="Search diagrams…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="picker__sort">
            <button
              className={`picker__sort-option${sortMode === 'name' ? ' picker__sort-option--active' : ''}`}
              onClick={() => setSortMode('name')}
            >
              Name
            </button>
            <button
              className={`picker__sort-option${sortMode === 'date' ? ' picker__sort-option--active' : ''}`}
              onClick={() => setSortMode('date')}
            >
              Date
            </button>
          </div>
        </div>

        {offerImport && (
          <div className="dashboard__import-banner">
            <span>We found a diagram saved in this browser. Import it into your account?</span>
            <button className="btn btn--primary" onClick={handleImportLocal}>
              Import
            </button>
            <button className="btn" onClick={() => setOfferImport(false)}>
              Dismiss
            </button>
          </div>
        )}

        {error && <p className="dashboard__error">{error}</p>}

        <div className="picker__body">
          <div className="picker__list">
            {visibleDiagrams?.map((d) => (
              <button
                key={d.id}
                className={`picker__row${selectedId === d.id ? ' picker__row--active' : ''}`}
                onClick={() => setSelectedId(d.id)}
                onDoubleClick={() => onOpenDiagram(d.id)}
              >
                <span className="picker__row-icon">
                  <FolderIcon />
                </span>
                <span className="picker__row-info">
                  <strong>{d.name}</strong>
                  <span>Modified {new Date(d.updated_at).toLocaleDateString()}</span>
                </span>
              </button>
            ))}
            {visibleDiagrams?.length === 0 && <p className="dashboard__empty">No diagrams found.</p>}
          </div>

          <div className="picker__detail">
            {selected ? (
              <>
                <h2>{selected.name}</h2>
                <p className="picker__detail-meta">
                  Last modified: {new Date(selected.updated_at).toLocaleString()}
                </p>
                <p className="picker__detail-meta">Created: {new Date(selected.created_at).toLocaleString()}</p>
                <div className="picker__detail-actions">
                  <button className="btn" onClick={() => handleDuplicate(selected.id)}>
                    <CopyIcon />
                    Duplicate
                  </button>
                  <button className="btn btn--danger" onClick={() => handleDelete(selected.id, selected.name)}>
                    <TrashIcon />
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <p className="picker__detail-empty">Select a diagram to see details.</p>
            )}
          </div>
        </div>

        <footer className="picker__footer">
          <button className="btn" onClick={handleCreate}>
            + New diagram
          </button>
          <div className="picker__footer-actions">
            {onDismiss && (
              <button className="btn" onClick={onDismiss}>
                Cancel
              </button>
            )}
            <button className="btn btn--primary" disabled={!selected} onClick={() => selected && onOpenDiagram(selected.id)}>
              Open
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
