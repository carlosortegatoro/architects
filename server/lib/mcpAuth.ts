import { pool } from '../db.js'
import { decodeTokenWithExpiry } from './jwt.js'

export const mcpTokenVerifier = {
  async verifyAccessToken(token: string) {
    const payload = decodeTokenWithExpiry(token)
    const result = await pool.query(
      'SELECT id, auth_version FROM users WHERE id = $1 AND email_verified_at IS NOT NULL',
      [payload.sub],
    )
    const user = result.rows[0]
    if (!user || (payload.ver ?? 0) !== user.auth_version) throw new Error('Token is no longer valid')
    return {
      token,
      clientId: payload.sub,
      scopes: [],
      expiresAt: payload.exp,
      extra: { userId: payload.sub, email: payload.email, authVersion: user.auth_version },
    }
  },
}
