import type { NextFunction, Request, Response } from 'express'
import { pool } from '../db.js'
import { verifyToken } from '../lib/jwt.js'

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; authVersion: number }
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  try {
    const payload = verifyToken(token)
    const result = await pool.query(
      `SELECT id, email, auth_version
       FROM users
       WHERE id = $1 AND email_verified_at IS NOT NULL`,
      [payload.sub],
    )
    const user = result.rows[0]
    if (!user || (payload.ver ?? 0) !== user.auth_version) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    req.user = { id: user.id, email: user.email, authVersion: user.auth_version }
    next()
  } catch {
    res.status(401).json({ error: 'Not authenticated' })
  }
}
