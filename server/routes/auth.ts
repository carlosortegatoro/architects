import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { signToken } from '../lib/jwt.js'
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js'

const router = Router()

const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^@\s]+@salesforce\.com$/i, 'Email must be a @salesforce.com address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

router.post('/register', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }
  const { email, password } = parsed.data

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const passwordHash = await hashPassword(password)
  const result = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, passwordHash],
  )
  const user = result.rows[0]

  const token = signToken({ sub: user.id, email: user.email })
  res.cookie('token', token, COOKIE_OPTIONS)
  res.status(201).json({ id: user.id, email: user.email })
})

router.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }
  const { email, password } = parsed.data

  const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email])
  const user = result.rows[0]
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const token = signToken({ sub: user.id, email: user.email })
  res.cookie('token', token, COOKIE_OPTIONS)
  res.json({ id: user.id, email: user.email })
})

router.post('/logout', (_req, res) => {
  res.clearCookie('token')
  res.status(204).end()
})

router.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json(req.user)
})

router.post('/mcp-token', requireAuth, (req: AuthedRequest, res) => {
  const token = signToken({ sub: req.user!.id, email: req.user!.email }, '3650d')
  res.json({ token })
})

export default router
