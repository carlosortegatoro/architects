import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js'
import type { DiagramFile } from '../../src/types.js'

const router = Router()
router.use(requireAuth)

const EMPTY_CONTENT: DiagramFile = { version: 1, nodes: [], edges: [], useCases: [] }

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  content: z.unknown().optional(),
})

router.get('/', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    'SELECT id, name, content, created_at, updated_at FROM diagrams WHERE owner_id = $1 ORDER BY updated_at DESC',
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
        summary: {
          systemCount,
          groupCount,
          infoCardCount,
          connectionCount: content.edges.length,
          useCaseNames,
          topLevelSystemNames,
          topLevelInfoCardHeaders,
        },
      }
    }),
  )
})

router.post('/', async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }

  const result = await pool.query(
    'INSERT INTO diagrams (owner_id, name, content) VALUES ($1, $2, $3) RETURNING id, name, created_at, updated_at',
    [req.user!.id, parsed.data.name, JSON.stringify(EMPTY_CONTENT)],
  )
  res.status(201).json(result.rows[0])
})

router.get('/:id', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    'SELECT id, name, content, created_at, updated_at FROM diagrams WHERE id = $1 AND owner_id = $2',
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

router.put('/:id', async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }
  const { name, content } = parsed.data
  if (name === undefined && content === undefined) {
    res.status(400).json({ error: 'Nothing to update' })
    return
  }

  const result = await pool.query(
    `UPDATE diagrams
     SET name = COALESCE($1, name),
         content = COALESCE($2, content),
         updated_at = now()
     WHERE id = $3 AND owner_id = $4
     RETURNING id, name, created_at, updated_at`,
    [name ?? null, content !== undefined ? JSON.stringify(content) : null, req.params.id, req.user!.id],
  )
  const diagram = result.rows[0]
  if (!diagram) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(diagram)
})

router.post('/:id/duplicate', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `INSERT INTO diagrams (owner_id, name, content)
     SELECT owner_id, name || ' (copy)', content FROM diagrams WHERE id = $1 AND owner_id = $2
     RETURNING id, name, created_at, updated_at`,
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
  const result = await pool.query('DELETE FROM diagrams WHERE id = $1 AND owner_id = $2 RETURNING id', [
    req.params.id,
    req.user!.id,
  ])
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.status(204).end()
})

export default router
