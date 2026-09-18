import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { isDeepStrictEqual } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { DiagramFile } from '../../src/types.js'
import { recordChange, traverseHistory, type DocumentHistory } from '../lib/diagramHistory.js'
import { absolutePositionOf } from '../../src/utils/nodeGrouping.js'

const fixture = (): DiagramFile => ({
  version: 1, nodes: [
    { id: 'g', type: 'group', position: { x: 100, y: 100 }, width: 500, height: 400, data: { label: 'Group', color: '#475569' } },
    { id: 'h', type: 'group', position: { x: 900, y: 100 }, width: 500, height: 400, data: { label: 'Other', color: '#475569' } },
    { id: 'a', type: 'systemBox', parentId: 'g', position: { x: 50, y: 70 }, width: 220, height: 110, data: { label: 'A', color: '#334155', icon: 'preset:salesforce' } },
    { id: 'b', type: 'systemBox', position: { x: 700, y: 500 }, width: 220, height: 110, data: { label: 'B', color: '#334155' } },
    { id: 'c', type: 'systemBox', position: { x: 1100, y: 700 }, width: 220, height: 110, data: { label: 'C', color: '#334155' } },
  ], edges: [{ id: 'edge', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', data: { useCaseIds: ['uc'] } }],
  useCases: [{ id: 'uc', name: 'Flow', color: '#2563eb', speed: 'real-time', shape: 'circle' }], scenarios: [],
})

async function setup(t: TestContext) {
  process.env.JWT_SECRET = 'mcp-parity-test-only'
  const { buildMcpServer } = await import('./server.js')
  const { verifyToken } = await import('../lib/jwt.js')
  type Record = { id: string; owner: string; name: string; content: DiagramFile; revision: number }
  const records = new Map<string, Record>([['d', { id: 'd', owner: 'alice', name: 'Diagram', content: fixture(), revision: 0 }],
    ['private', { id: 'private', owner: 'bob', name: 'Private', content: fixture(), revision: 0 }]])
  const histories = new Map<string, DocumentHistory>()
  const shares = new Map<string, { id: string; url: string; diagramId: string; revoked: boolean }>()
  let writes = 0
  let conflict = false
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input))
    assert.equal(url.hostname, 'localhost')
    const [, , , diagramId, action, linkId] = url.pathname.split('/')
    const method = init?.method ?? 'GET'
    const user = verifyToken(String((init?.headers as { Cookie: string }).Cookie).slice(6)).sub
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const fail = (status: number) => Response.json({ error: status === 409 ? 'Diagram changed' : 'Not found' }, { status })
    if (!diagramId && method === 'POST') {
      const id = `new-${records.size}`
      const record = { id, name: body.name, content: body.content ?? { version: 1, nodes: [], edges: [], useCases: [] }, owner: user, revision: 0 }
      records.set(id, record); writes++; return Response.json(record)
    }
    const record = records.get(diagramId)
    if (!record || record.owner !== user) return fail(404)
    if (action === 'history') return Response.json({ revision: record.revision, undo_count: histories.get(diagramId)?.past.length ?? 0, redo_count: histories.get(diagramId)?.future.length ?? 0 })
    if (action === 'duplicate') {
      const id = `copy-${records.size}`
      const copy = { ...structuredClone(record), id, name: `${record.name} (copy)`, revision: 0 }
      records.set(id, copy); writes++; return Response.json(copy)
    }
    if (action === 'share') {
      if (method === 'GET') return Response.json([...shares.values()].filter((s) => s.diagramId === diagramId))
      if (method === 'POST') {
        assert.ok(body.durationHours > 0)
        const id = `link-${shares.size}`, link = { id, url: `/s/token-${id}`, diagramId, revoked: false }
        shares.set(id, link); writes++; return Response.json(link)
      }
      const link = shares.get(linkId)
      if (!link || link.diagramId !== diagramId) return fail(404)
      link.revoked = true; writes++; return new Response(null, { status: 204 })
    }
    if (method === 'GET') return Response.json(record)
    if (method === 'DELETE') {
      assert.equal(body.expectedRevision, record.revision)
      assert.equal(body.confirmName, record.name)
      records.delete(diagramId); histories.delete(diagramId); writes++
      return new Response(null, { status: 204 })
    }
    assert.equal(method, 'PUT')
    if (conflict) { conflict = false; record.revision++; record.name = 'Concurrent UI edit' }
    if (body.expectedRevision !== record.revision) return fail(409)
    const before = { name: record.name, content: record.content }
    let target = { name: body.name ?? record.name, content: body.content ?? record.content }
    let history = histories.get(diagramId) ?? { past: [], future: [] }
    if (body.historyAction) {
      try { const moved = traverseHistory(history, before, body.historyAction); target = moved.target; history = moved.history }
      catch { return fail(409) }
    } else if (isDeepStrictEqual(before, target)) return Response.json(record)
    else { assert.equal(body.recordHistory, true); history = recordChange(history, before) }
    histories.set(diagramId, structuredClone(history))
    Object.assign(record, structuredClone(target), { revision: record.revision + 1 }); writes++
    return Response.json(record)
  })
  async function connect(userId = 'alice') {
    const server = buildMcpServer({ userId, email: `${userId}@example.com`, authVersion: 0 })
    const client = new Client({ name: 'parity-test', version: '1' })
    const [ct, st] = InMemoryTransport.createLinkedPair()
    await server.connect(st); await client.connect(ct)
    t.after(async () => { await client.close(); await server.close() })
    return client
  }
  const client = await connect()
  async function call(name: string, args: object = {}, expectError = false, caller = client) {
    const result = await caller.callTool({ name, arguments: { diagramId: 'd', ...args } })
    const text = (result.content as { type: string; text: string }[]).find((c) => c.type === 'text')?.text ?? ''
    assert.equal(Boolean(result.isError), expectError, text)
    return expectError ? text : JSON.parse(text)
  }
  return { client, connect, call, records, histories, shares, doc: () => records.get('d')!.content, writes: () => writes,
    conflict: () => { conflict = true }, uiEdit: () => { records.get('d')!.revision++; histories.delete('d') } }
}

test('MCP exposes the complete document-editing tool inventory and safe annotations', async (t) => {
  const s = await setup(t)
  const tools = (await s.client.listTools()).tools
  const expected = ['create_annotation', 'update_node', 'change_node_shape', 'fit_group', 'align_nodes', 'distribute_nodes', 'update_connection', 'update_use_case',
    'list_scenarios', 'create_scenario', 'update_scenario', 'delete_scenario', 'set_diagram_options', 'duplicate_diagram', 'import_diagram', 'export_diagram',
    'delete_diagram', 'list_share_links', 'create_share_link', 'revoke_share_link', 'get_diagram_history', 'undo_diagram_change', 'redo_diagram_change']
  assert.equal(tools.length, 38)
  expected.forEach((name) => assert.ok(tools.some((tool) => tool.name === name), name))
  assert.equal(tools.find((t) => t.name === 'delete_diagram')?.annotations?.destructiveHint, true)
  assert.equal(tools.find((t) => t.name === 'export_diagram')?.annotations?.readOnlyHint, true)
  assert.equal(tools.find((t) => t.name === 'create_share_link')?.annotations?.openWorldHint, true)
})

test('scenario CRUD and use-case renaming preserve references; invalid references are atomic', async (t) => {
  const s = await setup(t)
  await s.call('create_scenario', { name: 'Invalid', useCaseIds: ['missing'] }, true)
  assert.equal(s.writes(), 0)
  const { scenarioId } = await s.call('create_scenario', { name: 'Sales', useCaseIds: ['uc'] })
  await s.call('update_scenario', { scenarioId, name: 'Sales revised' })
  await s.call('update_use_case', { useCaseId: 'uc', name: 'Renamed', color: '#16a34a', speed: 'batch' })
  assert.equal(s.doc().useCases.length, 1)
  assert.deepEqual((await s.call('list_scenarios')).scenarios[0], { id: scenarioId, name: 'Sales revised', useCaseIds: ['uc'] })
  assert.deepEqual(s.doc().edges[0].data.useCaseIds, ['uc'])
  await s.call('delete_use_case', { useCaseId: 'uc' })
  assert.deepEqual(s.doc().scenarios![0].useCaseIds, [])
  assert.deepEqual(s.doc().edges[0].data.useCaseIds, [])
  await s.call('delete_scenario', { scenarioId })
  assert.deepEqual(s.doc().scenarios, [])
})

test('node editing, parent changes and Fit keep canvas positions and reject unsafe geometry', async (t) => {
  const s = await setup(t)
  const abs = (id: string) => absolutePositionOf(s.doc().nodes.find((n) => n.id === id)!, new Map(s.doc().nodes.map((n) => [n.id, n])))
  await s.call('update_node', { nodeId: 'a', parentId: 'h', label: 'Edited', color: '#dc2626' })
  assert.deepEqual(abs('a'), { x: 150, y: 170 })
  await s.call('update_node', { nodeId: 'a', position: { x: 950, y: 180 }, width: 250, height: 130 })
  assert.deepEqual(s.doc().nodes.find((n) => n.id === 'a')!.position, { x: 50, y: 80 })
  assert.equal(s.doc().nodes.find((n) => n.id === 'h')!.width, 500)
  await s.call('fit_group', { nodeId: 'h' })
  assert.deepEqual(abs('a'), { x: 950, y: 180 })
  await s.call('update_node', { nodeId: 'a', parentId: null })
  assert.equal(s.doc().nodes.find((n) => n.id === 'a')!.parentId, undefined)
  assert.deepEqual(abs('a'), { x: 950, y: 180 })
  await s.call('update_node', { nodeId: 'g', parentId: 'h' })
  const before = structuredClone(s.doc()), writes = s.writes()
  await s.call('update_node', { nodeId: 'h', parentId: 'g' }, true)
  await s.call('update_node', { nodeId: 'a', width: 1 }, true)
  await s.call('update_node', { nodeId: 'a', header: 'Wrong type' }, true)
  assert.deepEqual(s.doc(), before); assert.equal(s.writes(), writes)
})

test('creation sizes, annotation editing and all shape conversions retain content and identities', async (t) => {
  const s = await setup(t)
  const { nodeId: logo } = await s.call('create_system', { label: 'Logo', displayMode: 'logoOnly', parentId: 'g' })
  assert.deepEqual([s.doc().nodes.find((n) => n.id === logo)!.width, s.doc().nodes.find((n) => n.id === logo)!.height], [90, 90])
  assert.equal(s.doc().nodes.find((n) => n.id === 'g')!.width, 500)
  const { nodeId } = await s.call('create_annotation', { title: 'Note', body: 'Details', parentId: 'g', position: { x: 50, y: 70 }, width: 280 })
  await s.call('update_node', { nodeId, body: 'Updated', icon: 'preset:salesforce' })
  for (const shape of ['infoCard', 'logoOnly', 'textOnly', 'full', 'annotation']) await s.call('change_node_shape', { nodeId, shape })
  const data = s.doc().nodes.find((n) => n.id === nodeId)!.data as { title: string; body: string; icon: string }
  assert.equal(data.title, 'Note'); assert.equal(data.body, 'Updated'); assert.equal(data.icon, 'preset:salesforce')
  await s.call('change_node_shape', { nodeId: 'g', shape: 'full' }, true)
  const before = s.writes()
  await s.call('change_node_shape', { nodeId, shape: 'annotation' })
  assert.equal(s.writes(), before)
})

test('connections can be re-anchored and edited without changing IDs; occupied handles cannot disappear', async (t) => {
  const s = await setup(t)
  await s.call('update_node', { nodeId: 'a', handleCounts: { top: 1, right: 3, bottom: 1, left: 1 } })
  await s.call('update_connection', { edgeId: 'edge', targetSystemId: 'c', sourceHandle: 'right-3', targetHandle: null, label: 'Changed', useCaseIds: [] })
  assert.equal(s.doc().edges[0].id, 'edge'); assert.equal(s.doc().edges[0].target, 'c')
  const before = s.writes()
  await s.call('update_node', { nodeId: 'a', handleCounts: { top: 1, right: 1, bottom: 1, left: 1 } }, true)
  await s.call('create_connection', { sourceSystemId: 'a', targetSystemId: 'b', useCaseIds: ['missing'] }, true)
  await s.call('update_connection', { edgeId: 'edge', targetHandle: 'left-4' }, true)
  assert.equal(s.writes(), before)
  await s.call('update_connection', { edgeId: 'edge', sourceHandle: 'right' })
  await s.call('update_node', { nodeId: 'a', handleCounts: { top: 1, right: 1, bottom: 1, left: 1 } })
})

test('alignment, distribution and diagram options use persisted geometry', async (t) => {
  const s = await setup(t)
  await s.call('update_node', { nodeId: 'a', parentId: null })
  await s.call('align_nodes', { nodeIds: ['a', 'b', 'c'], mode: 'top' })
  assert.deepEqual(s.doc().nodes.filter((n) => ['a', 'b', 'c'].includes(n.id)).map((n) => n.position.y), [170, 170, 170])
  await s.call('distribute_nodes', { nodeIds: ['a', 'b', 'c'], mode: 'horizontal' })
  const boxes = s.doc().nodes.filter((n) => ['a', 'b', 'c'].includes(n.id))
  assert.equal(boxes[1].position.x - boxes[0].position.x, boxes[2].position.x - boxes[1].position.x)
  await s.call('set_diagram_options', { floatingEdges: true, showEdgeLabels: false })
  assert.equal(s.doc().floatingEdges, true); assert.equal(s.doc().showEdgeLabels, false)
})

test('import/export and duplicate retain document semantics; malformed documents never create anything', async (t) => {
  const s = await setup(t)
  const { content } = await s.call('export_diagram')
  const imported = await s.call('import_diagram', { diagramId: undefined, name: 'Imported', content })
  assert.deepEqual(s.records.get(imported.id)!.content, content)
  const copy = await s.call('duplicate_diagram')
  assert.deepEqual(s.records.get(copy.id)!.content, content)
  const replacement = { version: 1, nodes: [], edges: [], useCases: [] }
  await s.call('import_diagram', { content: replacement }, true)
  await s.call('import_diagram', { content: replacement, confirmReplace: true })
  assert.deepEqual(s.doc(), replacement)
  assert.equal(s.records.get('d')!.name, 'Diagram')
  await s.call('undo_diagram_change')
  assert.deepEqual(s.doc(), content)
  const invalid = structuredClone(content)
  invalid.nodes[0].parentId = 'g'
  const before = s.writes()
  await s.call('import_diagram', { diagramId: undefined, name: 'Invalid', content: invalid }, true)
  invalid.nodes[0].parentId = undefined
  invalid.edges[0].target = 'missing'
  await s.call('import_diagram', { diagramId: undefined, name: 'Invalid', content: invalid }, true)
  assert.equal(s.writes(), before)
})

test('sharing and permanent deletion require confirmation and stay within the authenticated owner', async (t) => {
  const s = await setup(t)
  await s.call('create_share_link', { durationHours: 24 }, true)
  await s.call('delete_diagram', { confirmName: 'Diagram' }, true)
  await s.call('delete_diagram', { confirmName: 'Wrong', confirmDelete: true }, true)
  await s.call('create_share_link', { diagramId: 'private', durationHours: 24, confirmSharing: true }, true)
  await s.call('update_node', { diagramId: 'private', nodeId: 'a', label: 'Forbidden' }, true)
  await s.call('duplicate_diagram', { diagramId: 'private' }, true)
  assert.equal(s.writes(), 0)
  const link = await s.call('create_share_link', { durationHours: 24, confirmSharing: true })
  assert.equal((await s.call('list_share_links')).length, 1)
  await s.call('revoke_share_link', { linkId: link.id })
  assert.equal(s.shares.get(link.id)!.revoked, true)
  await s.call('delete_diagram', { confirmName: 'Diagram', confirmDelete: true })
  assert.equal(s.records.has('d'), false)
  assert.equal(s.records.has('private'), true)
})

test('persistent history survives new MCP server instances, supports redo and protects UI/concurrent edits', async (t) => {
  const s = await setup(t), before = structuredClone(s.doc())
  await s.call('update_node', { nodeId: 'a', label: 'Edited' })
  await s.call('create_scenario', { name: 'Scenario', useCaseIds: ['uc'] })
  const after = structuredClone(s.doc())
  const anotherClient = await s.connect()
  assert.equal((await s.call('get_diagram_history')).undo_count, 2)
  await s.call('undo_diagram_change', {}, false, anotherClient)
  await s.call('undo_diagram_change')
  assert.deepEqual(s.doc(), before)
  await s.call('redo_diagram_change'); await s.call('redo_diagram_change')
  assert.deepEqual(s.doc(), after)
  await s.call('undo_diagram_change')
  await s.call('update_node', { nodeId: 'a', color: '#dc2626' })
  assert.equal((await s.call('get_diagram_history')).redo_count, 0)
  const snapshot = structuredClone(s.doc())
  s.conflict()
  await s.call('update_node', { nodeId: 'a', label: 'Must not overwrite' }, true)
  assert.deepEqual(s.doc(), snapshot)
  s.uiEdit()
  await s.call('undo_diagram_change', {}, true)
  assert.deepEqual(s.doc(), snapshot)
})
