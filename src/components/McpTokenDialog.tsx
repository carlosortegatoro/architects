import { useEffect, useState } from 'react'
import { authApi } from '../api/client'
import { CopyIcon } from './Icon'

type McpTokenDialogProps = {
  onClose: () => void
}

export function McpTokenDialog({ onClose }: McpTokenDialogProps) {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<'token' | 'url' | 'config' | null>(null)

  const mcpUrl = `${window.location.origin}/mcp`

  useEffect(() => {
    authApi
      .createMcpToken()
      .then((res) => setToken(res.token))
      .catch(() => setError('Could not generate token'))
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const configJson = token
    ? JSON.stringify(
        {
          mcpServers: {
            architectures: {
              url: mcpUrl,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      )
    : ''

  async function handleCopy(field: 'token' | 'url' | 'config', value: string) {
    await navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal share-dialog">
        <header className="picker__header">
          <h1>MCP token</h1>
          <button className="btn modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="share-dialog__body">
          {error && <p className="dashboard__error">{error}</p>}

          {token && (
            <>
              <p className="dashboard__empty">Server URL — point your MCP client at this address:</p>
              <div className="share-dialog__row">
                <span className="share-dialog__url">{mcpUrl}</span>
                <button
                  className="btn btn--icon"
                  onClick={() => handleCopy('url', mcpUrl)}
                  data-tooltip={copiedField === 'url' ? 'Copied!' : 'Copy URL'}
                >
                  <CopyIcon />
                </button>
              </div>

              <p className="dashboard__empty">Token — send it as the bearer credential:</p>
              <div className="share-dialog__row">
                <span className="share-dialog__url">{token}</span>
                <button
                  className="btn btn--icon"
                  onClick={() => handleCopy('token', token)}
                  data-tooltip={copiedField === 'token' ? 'Copied!' : 'Copy token'}
                >
                  <CopyIcon />
                </button>
              </div>

              <p className="dashboard__empty">Or paste this config directly (Cursor, Claude Desktop, etc.):</p>
              <div className="share-dialog__row">
                <span className="share-dialog__url" style={{ whiteSpace: 'pre', textAlign: 'left' }}>
                  {configJson}
                </span>
                <button
                  className="btn btn--icon"
                  onClick={() => handleCopy('config', configJson)}
                  data-tooltip={copiedField === 'config' ? 'Copied!' : 'Copy config'}
                >
                  <CopyIcon />
                </button>
              </div>

              <p className="dashboard__empty">
                Copy the token now — it won't be shown again. If you're testing locally, this URL points at{' '}
                <code>{window.location.origin}</code>; generate a new token here once you switch to the deployed
                app, since the token and URL are tied to whichever origin you're on when you open this dialog.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
