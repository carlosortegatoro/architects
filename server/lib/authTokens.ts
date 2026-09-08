import { pool } from '../db.js'
import { generateAuthToken, hashAuthToken } from './authTokenCrypto.js'

export type AuthTokenPurpose = 'verify_email' | 'reset_password'

const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
}

const RESEND_COOLDOWN_SECONDS = 60

export async function authTokenIssuedRecently(userId: string, purpose: AuthTokenPurpose): Promise<boolean> {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM auth_tokens
       WHERE user_id = $1
         AND purpose = $2
         AND created_at > now() - ($3 * interval '1 second')
     ) AS recent`,
    [userId, purpose, RESEND_COOLDOWN_SECONDS],
  )
  return result.rows[0]?.recent === true
}

export async function issueAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
): Promise<{ token: string; tokenHash: string }> {
  const token = generateAuthToken()
  const tokenHash = hashAuthToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[purpose])

  await pool.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, purpose, tokenHash, expiresAt],
  )

  return { token, tokenHash }
}

export async function discardAuthToken(tokenHash: string): Promise<void> {
  await pool.query('DELETE FROM auth_tokens WHERE token_hash = $1', [tokenHash])
}

export async function invalidateOtherAuthTokens(
  userId: string,
  purpose: AuthTokenPurpose,
  tokenHash: string,
): Promise<void> {
  await pool.query(
    `UPDATE auth_tokens SET consumed_at = now()
     WHERE user_id = $1 AND purpose = $2 AND token_hash <> $3 AND consumed_at IS NULL`,
    [userId, purpose, tokenHash],
  )
}

export async function verifyEmailWithToken(token: string): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tokenHash = hashAuthToken(token)
    const ownerResult = await client.query(
      `SELECT user_id FROM auth_tokens
       WHERE token_hash = $1
         AND purpose = 'verify_email'
         AND consumed_at IS NULL
         AND expires_at > now()`,
      [tokenHash],
    )
    const row = ownerResult.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return false
    }

    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [row.user_id])
    const validResult = await client.query(
      `SELECT id FROM auth_tokens
       WHERE token_hash = $1
         AND purpose = 'verify_email'
         AND consumed_at IS NULL
         AND expires_at > now()`,
      [tokenHash],
    )
    if (validResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return false
    }

    await client.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [
      row.user_id,
    ])
    await client.query(
      `UPDATE auth_tokens SET consumed_at = now()
       WHERE user_id = $1 AND purpose = 'verify_email' AND consumed_at IS NULL`,
      [row.user_id],
    )
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function resetPasswordWithToken(token: string, passwordHash: string): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tokenHash = hashAuthToken(token)
    const ownerResult = await client.query(
      `SELECT t.user_id
       FROM auth_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1
         AND t.purpose = 'reset_password'
         AND t.consumed_at IS NULL
         AND t.expires_at > now()
         AND u.email_verified_at IS NOT NULL`,
      [tokenHash],
    )
    const row = ownerResult.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return false
    }

    const userResult = await client.query(
      'SELECT id FROM users WHERE id = $1 AND email_verified_at IS NOT NULL FOR UPDATE',
      [row.user_id],
    )
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return false
    }
    const validResult = await client.query(
      `SELECT id FROM auth_tokens
       WHERE token_hash = $1
         AND purpose = 'reset_password'
         AND consumed_at IS NULL
         AND expires_at > now()`,
      [tokenHash],
    )
    if (validResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return false
    }

    await client.query(
      'UPDATE users SET password_hash = $1, auth_version = auth_version + 1 WHERE id = $2',
      [passwordHash, row.user_id],
    )
    await client.query(
      `UPDATE auth_tokens SET consumed_at = now()
       WHERE user_id = $1 AND purpose = 'reset_password' AND consumed_at IS NULL`,
      [row.user_id],
    )
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
