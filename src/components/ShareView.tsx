import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Canvas } from './Canvas'
import { PresentationLegend } from './PresentationLegend'
import { ApiError, publicShareApi } from '../api/client'
import { useDiagramStore } from '../store/diagramStore'

type Status = 'loading' | 'error' | 'gone' | 'ready'

export function ShareView() {
  const { token } = useParams<{ token: string }>()
  const [status, setStatus] = useState<Status>('loading')
  const [name, setName] = useState('')
  const theme = useDiagramStore((s) => s.theme)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }
    let cancelled = false
    publicShareApi
      .get(token)
      .then((share) => {
        if (cancelled) return
        useDiagramStore.getState().loadDiagram(share.content)
        setName(share.name)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus(err instanceof ApiError && err.status === 410 ? 'gone' : 'error')
      })
    return () => {
      cancelled = true
      useDiagramStore.getState().clearDiagram()
    }
  }, [token])

  if (status === 'loading') return <div className="app__loading">Loading…</div>

  if (status === 'error') {
    return (
      <div className="app__load-error">
        <p>This link was not found.</p>
      </div>
    )
  }

  if (status === 'gone') {
    return (
      <div className="app__load-error">
        <p>This link is no longer available.</p>
      </div>
    )
  }

  return (
    <div className={`app app--presenting${theme === 'light' ? ' app--light' : ''}`}>
      <div className="app__body">
        <Canvas interactive={false} />
        <PresentationLegend />
        <h1 className="share-view__title">{name}</h1>
      </div>
    </div>
  )
}
