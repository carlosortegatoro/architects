import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js'
import { generateShareToken } from '../lib/token.js'

const MAX_DURATION_HOURS = 24 * 30

const createSchema = z.object({
  durationHours: z.number().int().positive().max(MAX_DURATION_HOURS),
})

export const authedShareRouter = Router()
authedShareRouter.use(requireAuth)

authedShareRouter.post('/:id/share', async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }

  const owned = await pool.query('SELECT id FROM diagrams WHERE id = $1 AND owner_id = $2', [
    req.params.id,
    req.user!.id,
  ])
  if (owned.rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const token = generateShareToken()
  const result = await pool.query(
    `INSERT INTO share_links (diagram_id, token, expires_at)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)
     RETURNING id, token, expires_at, revoked_at, created_at`,
    [req.params.id, token, parsed.data.durationHours],
  )
  const link = result.rows[0]
  res.status(201).json({
    id: link.id,
    token: link.token,
    url: `/s/${link.token}`,
    expiresAt: link.expires_at,
    revokedAt: link.revoked_at,
    createdAt: link.created_at,
  })
})

authedShareRouter.get('/:id/share', async (req: AuthedRequest, res) => {
  const owned = await pool.query('SELECT id FROM diagrams WHERE id = $1 AND owner_id = $2', [
    req.params.id,
    req.user!.id,
  ])
  if (owned.rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const result = await pool.query(
    `SELECT id, token, expires_at, revoked_at, created_at FROM share_links
     WHERE diagram_id = $1 ORDER BY created_at DESC`,
    [req.params.id],
  )
  res.json(
    result.rows.map((link) => ({
      id: link.id,
      token: link.token,
      url: `/s/${link.token}`,
      expiresAt: link.expires_at,
      revokedAt: link.revoked_at,
      createdAt: link.created_at,
    })),
  )
})

authedShareRouter.patch('/:id/share/:linkId', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `UPDATE share_links SET revoked_at = now()
     WHERE id = $1
       AND diagram_id = $2
       AND revoked_at IS NULL
       AND diagram_id IN (SELECT id FROM diagrams WHERE owner_id = $3)
     RETURNING id`,
    [req.params.linkId, req.params.id, req.user!.id],
  )
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.status(204).end()
})

export const publicShareRouter = Router()

publicShareRouter.get('/:token', async (req, res) => {
  const result = await pool.query(
    `SELECT d.name, d.content, sl.expires_at, sl.revoked_at
     FROM share_links sl
     JOIN diagrams d ON d.id = sl.diagram_id
     WHERE sl.token = $1`,
    [req.params.token],
  )
  const row = result.rows[0]
  if (!row) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (row.revoked_at !== null || new Date(row.expires_at) <= new Date()) {
    res.status(410).json({ error: 'Gone' })
    return
  }
  res.json({ name: row.name, content: row.content })
})
