import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type { DiagramFile } from '../src/types'

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
const { useDiagramStore: store } = await import('../src/store/diagramStore')
const empty: DiagramFile = { version: 1, nodes: [], edges: [], useCases: [] }
const record = (revision: number) => ({ id: 'd', name: 'Diagram', revision, content: empty, updated_at: `version-${revision}`, created_at: 'created' })

beforeEach(() => {
  store.getState().loadDiagram(structuredClone(empty))
  store.setState({ diagramId: 'd', diagramName: 'Diagram', lastKnownUpdatedAt: 'version-0', lastKnownRevision: 0,
    isDirty: true, isSaving: false, isLoading: false, remoteChangeAvailable: false })
})

test('UI saves carry the loaded revision; conflicts keep local edits and stop automatic overwrites', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    calls++
    assert.equal(JSON.parse(String(init?.body)).expectedRevision, 0)
    return Response.json({ error: 'Diagram changed' }, { status: 409 })
  })
  store.getState().addNode({ x: 10, y: 20 })
  const local = store.getState().toDiagramFile()
  await store.getState().saveDiagram()
  assert.equal(store.getState().remoteChangeAvailable, true)
  assert.equal(store.getState().isDirty, true); assert.equal(store.getState().isSaving, false)
  assert.deepEqual(store.getState().toDiagramFile(), local)
  await store.getState().saveDiagram()
  assert.equal(calls, 1)
})

test('edits during an in-flight save remain dirty and are saved next with the new revision', async (t) => {
  let finish!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => { finish = resolve })
  const requests: any[] = []
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)))
    return requests.length === 1 ? pending : Response.json(record(2))
  })
  const save = store.getState().saveDiagram()
  store.getState().addNode({ x: 1, y: 2 })
  await store.getState().saveDiagram()
  assert.equal(requests.length, 1)
  finish(Response.json(record(1)))
  await save
  assert.equal(store.getState().isDirty, true); assert.equal(store.getState().lastKnownRevision, 1)
  await store.getState().saveDiagram()
  assert.equal(requests[1].expectedRevision, 1); assert.equal(requests[1].content.nodes.length, 1)
  assert.equal(store.getState().isDirty, false); assert.equal(store.getState().lastKnownRevision, 2)
})

test('rename uses the same serialized save path and updates its revision', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.name, 'Renamed'); assert.equal(body.expectedRevision, 0)
    return Response.json({ ...record(1), name: 'Renamed' })
  })
  await store.getState().renameDiagram('Renamed')
  assert.equal(store.getState().diagramName, 'Renamed')
  assert.equal(store.getState().lastKnownRevision, 1); assert.equal(store.getState().isDirty, false)
})

test('a response from a previously closed document does not change the new editor state', async (t) => {
  let finish!: (response: Response) => void
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { finish = resolve }))
  const save = store.getState().saveDiagram()
  store.getState().closeDiagram()
  finish(Response.json(record(1)))
  await save
  assert.equal(store.getState().diagramId, null); assert.equal(store.getState().lastKnownRevision, null)
  assert.equal(store.getState().isSaving, false)
})

test('remote version polling notices edits made while the request is in flight', async (t) => {
  store.setState({ isDirty: false })
  let finish!: (response: Response) => void
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { finish = resolve }))
  const poll = store.getState().checkRemoteVersion()
  store.getState().addNode({ x: 10, y: 20 })
  finish(Response.json({ updated_at: 'version-1' }))
  await poll
  assert.equal(store.getState().remoteChangeAvailable, true)
  assert.equal(store.getState().nodes.length, 1)
})
