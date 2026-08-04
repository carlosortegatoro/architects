import { pool } from '../db.js'
import { decodeTokenWithExpiry } from './jwt.js'

export const mcpTokenVerifier = {
  async verifyAccessToken(token: string) {
    const payload = decodeTokenWithExpiry(token)
    const result = await pool.query('SELECT id FROM users WHERE id = $1', [payload.sub])
    if (result.rows.length === 0) throw new Error('User no longer exists')
    return {
      token,
      clientId: payload.sub,
      scopes: [],
      expiresAt: payload.exp,
      extra: { userId: payload.sub, email: payload.email },
    }
  },
}
