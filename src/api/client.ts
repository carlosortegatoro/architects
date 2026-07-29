import type { DiagramFile } from '../types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export type CurrentUser = { id: string; email: string }

export type DiagramSummary = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type DiagramRecord = DiagramSummary & { content: DiagramFile }

export type ShareLink = {
  id: string
  token: string
  url: string
  expiresAt: string
  revokedAt: string | null
  createdAt: string
}

export type PublicShare = {
  name: string
  content: DiagramFile
}

export const authApi = {
  register: (email: string, password: string) =>
    request<CurrentUser>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/auth/me'),
}

export const diagramsApi = {
  list: () => request<DiagramSummary[]>('/diagrams'),
  create: (name: string) => request<DiagramSummary>('/diagrams', { method: 'POST', body: JSON.stringify({ name }) }),
  get: (id: string) => request<DiagramRecord>(`/diagrams/${id}`),
  update: (id: string, patch: { name?: string; content?: DiagramFile }) =>
    request<DiagramSummary>(`/diagrams/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  duplicate: (id: string) => request<DiagramSummary>(`/diagrams/${id}/duplicate`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/diagrams/${id}`, { method: 'DELETE' }),
}

export const shareApi = {
  list: (diagramId: string) => request<ShareLink[]>(`/diagrams/${diagramId}/share`),
  create: (diagramId: string, durationHours: number) =>
    request<ShareLink>(`/diagrams/${diagramId}/share`, {
      method: 'POST',
      body: JSON.stringify({ durationHours }),
    }),
  revoke: (diagramId: string, linkId: string) =>
    request<void>(`/diagrams/${diagramId}/share/${linkId}`, { method: 'PATCH' }),
}

export const publicShareApi = {
  get: (token: string) => request<PublicShare>(`/share/${token}`),
}
