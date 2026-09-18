import type { DiagramFile } from '../types'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error ?? res.statusText, body?.code)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export type CurrentUser = { id: string; email: string }
export type RegistrationResult = { status: 'verification_required'; email: string }

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
    request<RegistrationResult>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/auth/me'),
  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/verification/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  confirmVerification: (token: string) =>
    request<void>('/auth/verification/confirm', { method: 'POST', body: JSON.stringify({ token }) }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<void>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  createMcpToken: () => request<{ token: string }>('/auth/mcp-token', { method: 'POST' }),
}

export const diagramsApi = {
  list: () => request<DiagramListEntry[]>('/diagrams'),
  create: (name: string) => request<DiagramSummary>('/diagrams', { method: 'POST', body: JSON.stringify({ name }) }),
  get: (id: string) => request<DiagramRecord>(`/diagrams/${id}`),
  update: (id: string, patch: { name?: string; content?: DiagramFile; expectedRevision?: number }) =>
    request<DiagramSummary>(`/diagrams/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  duplicate: (id: string) => request<DiagramSummary>(`/diagrams/${id}/duplicate`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/diagrams/${id}`, { method: 'DELETE' }),
  getVersion: (id: string) => request<{ updated_at: string }>(`/diagrams/${id}/version`),
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
