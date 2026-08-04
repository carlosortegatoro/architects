import jwt from 'jsonwebtoken'
import type { StringValue } from 'ms'

export interface JwtPayload {
  sub: string
  email: string
}

type DecodedJwtPayload = JwtPayload & { exp: number }

const JWT_SECRET = process.env.JWT_SECRET

export function signToken(payload: JwtPayload, expiresIn: StringValue = '7d'): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set')
  return jwt.sign(payload, JWT_SECRET, { expiresIn })
}

export function verifyToken(token: string): JwtPayload {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set')
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export function decodeTokenWithExpiry(token: string): DecodedJwtPayload {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set')
  return jwt.verify(token, JWT_SECRET) as DecodedJwtPayload
}
