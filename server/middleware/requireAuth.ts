import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../lib/jwt.js'

export interface AuthedRequest extends Request {
  user?: { id: string; email: string }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  try {
    const payload = verifyToken(token)
    req.user = { id: payload.sub, email: payload.email }
    next()
  } catch {
    res.status(401).json({ error: 'Not authenticated' })
  }
}
