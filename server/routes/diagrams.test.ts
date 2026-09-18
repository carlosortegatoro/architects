import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import type { DiagramFile } from '../../src/types.js'
import { recordChange, traverseHistory, type DocumentHistory } from '../lib/diagramHistory.js'

process.env.JWT_SECRET = 'diagram-route-tests-only'
const { default: router } = await import('./diagrams.js')
const { pool } = await import('../db.js')

// Exercise the real Express handlers and their SQL contract with a transactional
// fake. No sockets or real database credentials are used by these tests.
async function invoke(method: string, path: string, body: unknown, userId = 'alice') {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method])
  assert.ok(layer, `${method} ${path}`)
  const response = { status: 200, body: undefined as any, error: undefined as unknown }
  const res = {
    status(code: number) { response.status = code; return res },
    json(value: unknown) { response.body = value; return res },
    end() { return res },
  }
  await (layer.route!.stack[0].handle as Function)({ body, params: { id: 'd' }, user: { id: userId } }, res, (error: unknown) => { response.error = error })
  return response
}

function database(t: TestContext) {
  const content: DiagramFile = { version: 1, nodes: [], edges: [], useCases: [] }
  let document = { id: 'd', owner_id: 'alice', name: 'Original', content, revision: 0 }
  let history: DocumentHistory | undefined
  let snapshot: { document: typeof document; history: typeof history } | undefined
  let failHistoryWrite = false
  let releases = 0
  const statements: string[] = []
  const query = async (sql: string, params: any[] = []) => {
    statements.push(sql)
    if (sql === 'BEGIN') snapshot = structuredClone({ document, history })
    else if (sql === 'ROLLBACK') { assert.ok(snapshot); ({ document, history } = snapshot); snapshot = undefined }
    else if (sql === 'COMMIT') snapshot = undefined
    else if (sql.startsWith('SELECT * FROM diagrams')) {
      assert.match(sql, /owner_id = \$2 FOR UPDATE/)
      return { rows: params[0] === document.id && params[1] === document.owner_id ? [structuredClone(document)] : [] }
    } else if (sql.startsWith('SELECT past, future')) {
      assert.equal(params[0], document.id)
      return { rows: history ? [structuredClone(history)] : [] }
    } else if (sql.startsWith('UPDATE diagrams')) {
      assert.match(sql, /owner_id = \$4/)
      assert.equal(params[2], document.id); assert.equal(params[3], document.owner_id)
      document = { ...document, name: params[0], content: JSON.parse(params[1]), revision: document.revision + 1 }
      return { rows: [structuredClone(document)] }
    } else if (sql.startsWith('INSERT INTO diagram_mcp_history')) {
      if (failHistoryWrite) throw new Error('Simulated storage failure')
      history = { past: JSON.parse(params[1]), future: JSON.parse(params[2]) }
    } else if (sql.startsWith('DELETE FROM diagram_mcp_history')) history = undefined
    else if (sql.startsWith('SELECT d.revision')) {
      assert.match(sql, /d.owner_id = \$2/)
      return { rows: params[0] === document.id && params[1] === document.owner_id
        ? [{ revision: document.revision, undo_count: history?.past.length ?? 0, redo_count: history?.future.length ?? 0 }] : [] }
    } else throw new Error(`Unexpected SQL: ${sql}`)
    return { rows: [] }
  }
  t.mock.method(pool, 'connect', async () => ({ query, release() { releases++ } }) as any)
  t.mock.method(pool, 'query', query as any)
  return {
    get document() { return document }, get history() { return history }, get releases() { return releases }, statements,
    failHistory() { failHistoryWrite = true },
  }
}

test('document update and undo/redo are committed with persistent history and monotonically increasing revisions', async (t) => {
  const db = database(t)
  let result = await invoke('put', '/:id', { name: 'Edited', expectedRevision: 0, recordHistory: true })
  assert.equal(result.error, undefined); assert.equal(result.status, 200)
  assert.equal(db.document.revision, 1); assert.equal(db.history?.past[0].name, 'Original')
  result = await invoke('put', '/:id', { historyAction: 'undo', expectedRevision: 1 })
  assert.equal(result.status, 200); assert.equal(db.document.name, 'Original'); assert.equal(db.document.revision, 2)
  assert.equal(db.history?.future[0].name, 'Edited')
  result = await invoke('put', '/:id', { historyAction: 'redo', expectedRevision: 2 })
  assert.equal(result.status, 200); assert.equal(db.document.name, 'Edited'); assert.equal(db.document.revision, 3)
  assert.deepEqual((await invoke('get', '/:id/history', {})).body, { revision: 3, undo_count: 1, redo_count: 0 })
  assert.equal(db.releases, 3)
})

test('owner checks and stale revisions reject writes before accessing history', async (t) => {
  const db = database(t)
  assert.equal((await invoke('put', '/:id', { name: 'Stolen', expectedRevision: 0, recordHistory: true }, 'bob')).status, 404)
  assert.equal((await invoke('get', '/:id/history', {}, 'bob')).status, 404)
  assert.equal((await invoke('put', '/:id', { name: 'Stale', expectedRevision: 10, recordHistory: true })).status, 409)
  assert.equal(db.document.name, 'Original'); assert.equal(db.document.revision, 0)
  assert.equal(db.history, undefined)
  assert.equal(db.statements.filter((sql) => sql === 'ROLLBACK').length, 2)
  assert.ok(!db.statements.some((sql) => sql.startsWith('SELECT past') || sql.startsWith('UPDATE')))
})

test('history failure rolls back the document update and releases the connection', async (t) => {
  const db = database(t)
  db.failHistory()
  const result = await invoke('put', '/:id', { name: 'Edited', expectedRevision: 0, recordHistory: true })
  assert.match(String(result.error), /Simulated storage failure/)
  assert.equal(db.document.name, 'Original'); assert.equal(db.document.revision, 0); assert.equal(db.history, undefined)
  assert.equal(db.statements.at(-1), 'ROLLBACK'); assert.equal(db.releases, 1)
})

test('no-op retains redo, while an actual UI edit clears MCP history', async (t) => {
  const db = database(t)
  await invoke('put', '/:id', { name: 'Edited', expectedRevision: 0, recordHistory: true })
  await invoke('put', '/:id', { historyAction: 'undo', expectedRevision: 1 })
  await invoke('put', '/:id', { name: 'Original', expectedRevision: 2, recordHistory: true })
  assert.equal(db.document.revision, 2); assert.equal(db.history?.future.length, 1)
  await invoke('put', '/:id', { name: 'UI edit', expectedRevision: 2 })
  assert.equal(db.document.revision, 3); assert.equal(db.history, undefined)
  assert.equal((await invoke('put', '/:id', { historyAction: 'undo', expectedRevision: 3 })).status, 409)
  assert.equal(db.document.name, 'UI edit')
})

test('malformed history requests and invalid imports fail before touching the database', async (t) => {
  const db = database(t)
  for (const body of [
    {}, { name: 'Edited', recordHistory: true }, { historyAction: 'undo' },
    { historyAction: 'undo', expectedRevision: 0, name: 'Edited' },
    { historyAction: 'redo', expectedRevision: 0, recordHistory: false }, { name: 'Edited', expectedRevision: -1 },
  ]) assert.equal((await invoke('put', '/:id', body)).status, 400)
  assert.equal((await invoke('post', '/', { name: 'Import', content: { version: 2 } })).status, 400)
  assert.deepEqual(db.statements, [])
})

test('history is immutable, bounded to 50 edits and clears redo after a new edit', () => {
  const initial: DocumentHistory = { past: [], future: [] }
  const current = { name: 'Current', content: { version: 1, nodes: [], edges: [], useCases: [] } as DiagramFile }
  let history = initial
  for (let i = 0; i < 60; i++) history = recordChange(history, { ...current, name: String(i) })
  assert.deepEqual(initial, { past: [], future: [] })
  assert.equal(history.past.length, 50); assert.equal(history.past[0].name, '10')
  const undone = traverseHistory(history, current, 'undo')
  assert.equal(history.past.length, 50); assert.equal(undone.target.name, '59')
  assert.equal(undone.history.future.length, 1)
  assert.equal(recordChange(undone.history, current).future.length, 0)
  assert.throws(() => traverseHistory(initial, current, 'undo'), /Nothing to undo/)
})
