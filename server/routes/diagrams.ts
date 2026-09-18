import { Router } from 'express'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js'
import type { DiagramFile } from '../../src/types.js'
import { isDeepStrictEqual } from 'node:util'
import { parseDiagram } from '../lib/diagramSchema.js'
import { recordChange, traverseHistory, type DocumentHistory } from '../lib/diagramHistory.js'

const router = Router()
router.use(requireAuth)

const EMPTY_CONTENT: DiagramFile = { version: 1, nodes: [], edges: [], useCases: [] }

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  content: z.unknown().optional(),
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  content: z.unknown().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  recordHistory: z.boolean().optional(),
  historyAction: z.enum(['undo', 'redo']).optional(),
})

router.get('/', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    'SELECT id, name, content, revision, created_at, updated_at FROM diagrams WHERE owner_id = $1 ORDER BY updated_at DESC',
    [req.user!.id],
  )
  res.json(
    result.rows.map((row) => {
      const content = row.content as DiagramFile
      const systemCount = content.nodes.filter((n) => n.type === 'systemBox').length
      const groupCount = content.nodes.filter((n) => n.type === 'group').length
      const infoCardCount = content.nodes.filter((n) => n.type === 'infoCard').length
      const topLevelSystemNames = content.nodes
        .filter((n) => n.type === 'systemBox' && n.parentId === undefined)
        .map((n) => (n.data as { label: string }).label)
      const topLevelInfoCardHeaders = content.nodes
        .filter((n) => n.type === 'infoCard' && n.parentId === undefined)
        .map((n) => (n.data as { header: string }).header)
      const useCaseNames = content.useCases.map((uc) => uc.name)

      return {
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        updated_at: row.updated_at,
        revision: row.revision,
        summary: {
          systemCount,
          groupCount,
          infoCardCount,
          annotationCount: content.nodes.filter((n) => n.type === 'annotation').length,
          scenarioNames: (content.scenarios ?? []).map((scenario) => scenario.name),
          connectionCount: content.edges.length,
          useCaseNames,
          topLevelSystemNames,
          topLevelInfoCardHeaders,
        },
      }
    }),
  )
})

router.post('/', async (req: AuthedRequest, res, next) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }

  let content = EMPTY_CONTENT
  try { if (parsed.data.content !== undefined) content = parseDiagram(parsed.data.content) }
  catch (error) { res.status(400).json({ error: String(error) }); return }
  try {
    const result = await pool.query(
      'INSERT INTO diagrams (owner_id, name, content) VALUES ($1, $2, $3) RETURNING id, name, revision, created_at, updated_at',
      [req.user!.id, parsed.data.name, JSON.stringify(content)],
    )
    res.status(201).json(result.rows[0])
  } catch (error) { next(error) }
})

router.get('/:id', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    'SELECT id, name, content, revision, created_at, updated_at FROM diagrams WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user!.id],
  )
  const diagram = result.rows[0]
  if (!diagram) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(diagram)
})

router.get('/:id/version', async (req: AuthedRequest, res) => {
  const result = await pool.query('SELECT updated_at FROM diagrams WHERE id = $1 AND owner_id = $2', [
    req.params.id,
    req.user!.id,
  ])
  const diagram = result.rows[0]
  if (!diagram) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(diagram)
})

router.get('/:id/history', async (req: AuthedRequest, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.revision, COALESCE(jsonb_array_length(h.past), 0) AS undo_count,
       COALESCE(jsonb_array_length(h.future), 0) AS redo_count
       FROM diagrams d LEFT JOIN diagram_mcp_history h ON h.diagram_id = d.id
       WHERE d.id = $1 AND d.owner_id = $2`, [req.params.id, req.user!.id],
    )
    if (!result.rows[0]) { res.status(404).json({ error: 'Not found' }); return }
    res.json(result.rows[0])
  } catch (error) { next(error) }
})

router.put('/:id', async (req: AuthedRequest, res, next) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }
  const { name, content, expectedRevision, recordHistory, historyAction } = parsed.data
  if (recordHistory && expectedRevision === undefined) {
    res.status(400).json({ error: 'Recording history requires expectedRevision' }); return
  }
  if (historyAction && (name !== undefined || content !== undefined || recordHistory !== undefined || expectedRevision === undefined)) {
    res.status(400).json({ error: 'History actions require expectedRevision and cannot include edits' }); return
  }
  if (!historyAction && name === undefined && content === undefined) {
    res.status(400).json({ error: 'Nothing to update' })
    return
  }

  // Lock the owned document before comparing revisions or updating history. A
  // failed concurrent edit never partially changes either document or history.
  let client: PoolClient | undefined
  try {
    client = await pool.connect()
    await client.query('BEGIN')
    const result = await client.query('SELECT * FROM diagrams WHERE id = $1 AND owner_id = $2 FOR UPDATE', [req.params.id, req.user!.id])
    const current = result.rows[0]
    if (!current) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Not found' }); return }
    if (expectedRevision !== undefined && expectedRevision !== current.revision) {
      await client.query('ROLLBACK'); res.status(409).json({ error: 'Diagram changed. Read it again before retrying.' }); return
    }
    const before = { name: current.name, content: current.content as DiagramFile }
    let target = { name: name ?? current.name, content: content === undefined ? current.content : content }
    let history: DocumentHistory | undefined
    if (recordHistory || historyAction) {
      const stored = await client.query('SELECT past, future FROM diagram_mcp_history WHERE diagram_id = $1', [req.params.id])
      history = stored.rows[0] ?? { past: [], future: [] }
      if (historyAction) {
        try { const traversed = traverseHistory(history!, before, historyAction); target = traversed.target; history = traversed.history }
        catch (error) { await client.query('ROLLBACK'); res.status(409).json({ error: String(error) }); return }
      } else {
        history = recordChange(history!, before)
      }
    }
    if (!historyAction && isDeepStrictEqual(before, target)) {
      await client.query('COMMIT'); res.json(current); return
    }
    const updated = await client.query(
      `UPDATE diagrams SET name = $1, content = $2, revision = revision + 1, updated_at = now()
       WHERE id = $3 AND owner_id = $4 RETURNING id, name, revision, created_at, updated_at`,
      [target.name, JSON.stringify(target.content), req.params.id, req.user!.id],
    )
    if (history) {
      await client.query(
        `INSERT INTO diagram_mcp_history (diagram_id, past, future) VALUES ($1, $2, $3)
         ON CONFLICT (diagram_id) DO UPDATE SET past = EXCLUDED.past, future = EXCLUDED.future`,
        [req.params.id, JSON.stringify(history.past), JSON.stringify(history.future)],
      )
    } else {
      // A UI edit starts a new history boundary: MCP undo cannot overwrite it.
      await client.query('DELETE FROM diagram_mcp_history WHERE diagram_id = $1', [req.params.id])
    }
    await client.query('COMMIT')
    res.json(updated.rows[0])
  } catch (error) {
    if (client) await client.query('ROLLBACK')
    next(error)
  } finally { client?.release() }
})

router.post('/:id/duplicate', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `INSERT INTO diagrams (owner_id, name, content)
     SELECT owner_id, name || ' (copy)', content FROM diagrams WHERE id = $1 AND owner_id = $2
     RETURNING id, name, revision, created_at, updated_at`,
    [req.params.id, req.user!.id],
  )
  const diagram = result.rows[0]
  if (!diagram) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.status(201).json(diagram)
})

router.delete('/:id', async (req: AuthedRequest, res) => {
  const confirmation = z.object({ expectedRevision: z.number().int().nonnegative().optional(), confirmName: z.string().optional() }).safeParse(req.body ?? {})
  if (!confirmation.success) { res.status(400).json({ error: 'Invalid confirmation' }); return }
  const result = await pool.query(`DELETE FROM diagrams WHERE id = $1 AND owner_id = $2
    AND ($3::integer IS NULL OR revision = $3) AND ($4::text IS NULL OR name = $4) RETURNING id`, [
    req.params.id,
    req.user!.id,
    confirmation.data.expectedRevision ?? null,
    confirmation.data.confirmName ?? null,
  ])
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.status(204).end()
})

export default router
