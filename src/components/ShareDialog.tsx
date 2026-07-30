import { useEffect, useState } from 'react'
import { shareApi, type ShareLink } from '../api/client'
import { CopyIcon, TrashIcon } from './Icon'

type ShareDialogProps = {
  diagramId: string
  onClose: () => void
}

const NEVER_EXPIRES_DATE = new Date('2100-01-01T00:00:00Z')
const NEVER_EXPIRES_HOURS = Math.ceil((NEVER_EXPIRES_DATE.getTime() - Date.now()) / (60 * 60 * 1000))

const DURATION_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'Never', hours: NEVER_EXPIRES_HOURS },
]

function isActive(link: ShareLink) {
  return link.revokedAt === null && new Date(link.expiresAt) > new Date()
}

function neverExpires(link: ShareLink) {
  return new Date(link.expiresAt).getUTCFullYear() >= 2100
}

export function ShareDialog({ diagramId, onClose }: ShareDialogProps) {
  const [links, setLinks] = useState<ShareLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [durationHours, setDurationHours] = useState(DURATION_OPTIONS[1].hours)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function refresh() {
    try {
      const list = await shareApi.list(diagramId)
      setLinks(list)
    } catch {
      setError('Could not load share links')
    }
  }

  useEffect(() => {
    refresh()
  }, [diagramId])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleCreate() {
    setCreating(true)
    try {
      await shareApi.create(diagramId, durationHours)
      await refresh()
    } catch {
      setError('Could not create link')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(linkId: string) {
    if (!confirm('Revoke this link? It will stop working immediately.')) return
    await shareApi.revoke(diagramId, linkId)
    refresh()
  }

  async function handleCopy(link: ShareLink) {
    const url = `${location.origin}${link.url}`
    await navigator.clipboard.writeText(url)
    setCopiedId(link.id)
    setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 1500)
  }

  const activeLinks = links?.filter(isActive) ?? []
  const inactiveLinks = links?.filter((l) => !isActive(l)) ?? []

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal share-dialog">
        <header className="picker__header">
          <h1>Share diagram</h1>
          <button className="btn modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="share-dialog__body">
          <div className="share-dialog__create">
            <select
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.hours} value={opt.hours}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button className="btn btn--primary" onClick={handleCreate} disabled={creating}>
              Create link
            </button>
          </div>

          {error && <p className="dashboard__error">{error}</p>}

          {links && activeLinks.length === 0 && (
            <p className="dashboard__empty">No active share links. Anyone with a link can view this diagram read-only.</p>
          )}

          {activeLinks.length > 0 && (
            <ul className="share-dialog__list">
              {activeLinks.map((link) => (
                <li key={link.id} className="share-dialog__row">
                  <span className="share-dialog__url">{`${location.origin}${link.url}`}</span>
                  <span className="share-dialog__expiry">
                    {neverExpires(link) ? 'Never expires' : `Expires ${new Date(link.expiresAt).toLocaleString()}`}
                  </span>
                  <button className="btn btn--icon" onClick={() => handleCopy(link)} data-tooltip={copiedId === link.id ? 'Copied!' : 'Copy link'}>
                    <CopyIcon />
                  </button>
                  <button className="btn btn--icon" onClick={() => handleRevoke(link.id)} data-tooltip="Revoke">
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {inactiveLinks.length > 0 && (
            <>
              <p className="share-dialog__section-label">Expired or revoked</p>
              <ul className="share-dialog__list share-dialog__list--inactive">
                {inactiveLinks.map((link) => (
                  <li key={link.id} className="share-dialog__row share-dialog__row--inactive">
                    <span className="share-dialog__url">{`${location.origin}${link.url}`}</span>
                    <span className="share-dialog__expiry">
                      {link.revokedAt ? 'Revoked' : 'Expired'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
