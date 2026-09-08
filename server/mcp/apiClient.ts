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
}

export type DiagramContentSummary = {
  systemCount: number
  groupCount: number
  infoCardCount: number
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
    create: (name: string) =>
      request<DiagramSummary>(sessionToken, '/diagrams', { method: 'POST', body: JSON.stringify({ name }) }),
    get: (id: string) => request<DiagramRecord>(sessionToken, `/diagrams/${id}`),
    update: (id: string, patch: { name?: string; content?: DiagramFile }) =>
      request<DiagramSummary>(sessionToken, `/diagrams/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  }
}
