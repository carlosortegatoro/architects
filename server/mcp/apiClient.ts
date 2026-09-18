import type { DiagramFile } from '../../src/types.js'

const PORT = process.env.PORT ?? 3001
const BASE_URL = `http://localhost:${PORT}`

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(sessionToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token=${sessionToken}`,
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body: any = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export type DiagramSummary = {
  id: string
  name: string
  created_at: string
  updated_at: string
  revision: number
}

export type DiagramContentSummary = {
  systemCount: number
  groupCount: number
  infoCardCount: number
  annotationCount: number
  scenarioNames: string[]
  connectionCount: number
  useCaseNames: string[]
  topLevelSystemNames: string[]
  topLevelInfoCardHeaders: string[]
}

export type DiagramListEntry = DiagramSummary & { summary: DiagramContentSummary }

export type DiagramRecord = DiagramSummary & { content: DiagramFile }

export function createDiagramsApi(sessionToken: string) {
  return {
    list: () => request<DiagramListEntry[]>(sessionToken, '/diagrams'),
    create: (name: string, content?: DiagramFile) =>
      request<DiagramSummary>(sessionToken, '/diagrams', { method: 'POST', body: JSON.stringify({ name, content }) }),
    get: (id: string) => request<DiagramRecord>(sessionToken, `/diagrams/${encodeURIComponent(id)}`),
    update: (id: string, patch: { name?: string; content?: DiagramFile; expectedRevision?: number; recordHistory?: boolean; historyAction?: 'undo' | 'redo' }) =>
      request<DiagramSummary>(sessionToken, `/diagrams/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
    duplicate: (id: string) => request<DiagramSummary>(sessionToken, `/diagrams/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
    remove: (id: string, expectedRevision: number, confirmName: string) => request<void>(sessionToken, `/diagrams/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision, confirmName }) }),
    history: (id: string) => request<{ revision: number; undo_count: number; redo_count: number }>(sessionToken, `/diagrams/${encodeURIComponent(id)}/history`),
    listShares: (id: string) => request<unknown[]>(sessionToken, `/diagrams/${encodeURIComponent(id)}/share`),
    createShare: (id: string, durationHours: number) => request<{ url: string }>(sessionToken, `/diagrams/${encodeURIComponent(id)}/share`, { method: 'POST', body: JSON.stringify({ durationHours }) }),
    revokeShare: (id: string, linkId: string) => request<void>(sessionToken, `/diagrams/${encodeURIComponent(id)}/share/${encodeURIComponent(linkId)}`, { method: 'PATCH' }),
  }
}
