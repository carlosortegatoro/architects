import jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  email: string
}

const JWT_SECRET = process.env.JWT_SECRET

export function signToken(payload: JwtPayload): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set')
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set')
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}
