import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { ALLOWED_EMAIL_ERROR, isAllowedEmailAddress } from '../../shared/emailPolicy.js'
import { pool } from '../db.js'
import { emailSender } from '../email/sender.js'
import {
  authTokenIssuedRecently,
  discardAuthToken,
  invalidateOtherAuthTokens,
  issueAuthToken,
  resetPasswordWithToken,
  verifyEmailWithToken,
  type AuthTokenPurpose,
} from '../lib/authTokens.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { signToken } from '../lib/jwt.js'
import { requireAuth, type AuthedRequest } from '../middleware/requireAuth.js'

const router = Router()

const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isAllowedEmailAddress, ALLOWED_EMAIL_ERROR)
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters')
const credentialsSchema = z.object({ email: emailAddressSchema, password: passwordSchema })
const emailSchema = z.object({ email: emailAddressSchema })
const tokenSchema = z.string().min(20).max(256)
const tokenRequestSchema = z.object({ token: tokenSchema })
const passwordResetSchema = z.object({ token: tokenSchema, password: passwordSchema })

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
}

const COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next: NextFunction) => {
    void handler(req, res).catch(next)
  }
}

function limiter(windowMs: number, limit: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' })
    },
  })
}

const loginLimiter = limiter(15 * 60 * 1000, 20)
const emailRequestLimiter = limiter(60 * 60 * 1000, 15)
const tokenActionLimiter = limiter(15 * 60 * 1000, 20)

async function deliverToken(
  user: { id: string; email: string },
  purpose: AuthTokenPurpose,
): Promise<void> {
  const issued = await issueAuthToken(user.id, purpose)
  try {
    if (purpose === 'verify_email') {
      await emailSender.sendVerificationEmail(user.email, issued.token)
    } else {
      await emailSender.sendPasswordResetEmail(user.email, issued.token)
    }
    await invalidateOtherAuthTokens(user.id, purpose, issued.tokenHash)
  } catch (error) {
    await discardAuthToken(issued.tokenHash)
    throw error
  }
}

router.post(
  '/register',
  emailRequestLimiter,
  asyncRoute(async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
      return
    }
    const { email, password } = parsed.data

    const existingResult = await pool.query(
      'SELECT id, email, email_verified_at FROM users WHERE email = $1',
      [email],
    )
    const existing = existingResult.rows[0]
    if (existing?.email_verified_at) {
      res.status(409).json({ error: 'Email already registered', code: 'EMAIL_ALREADY_REGISTERED' })
      return
    }

    if (existing) {
      if (!(await authTokenIssuedRecently(existing.id, 'verify_email'))) {
        try {
          await deliverToken(existing, 'verify_email')
        } catch (error) {
          console.error('Could not resend registration verification email', error)
          res.status(503).json({
            error: 'The account is pending, but the verification email could not be sent. Please try again.',
            code: 'EMAIL_SEND_FAILED',
          })
          return
        }
      }
      res.status(202).json({ status: 'verification_required', email })
      return
    }

    const passwordHash = await hashPassword(password)
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [email, passwordHash],
    )
    const user = result.rows[0]
    if (!user) {
      res.status(409).json({ error: 'Email already registered', code: 'EMAIL_ALREADY_REGISTERED' })
      return
    }

    try {
      await deliverToken(user, 'verify_email')
    } catch (error) {
      console.error('Could not send registration verification email', error)
      res.status(503).json({
        error: 'Your account was created, but the verification email could not be sent. Please try resending it.',
        code: 'EMAIL_SEND_FAILED',
      })
      return
    }

    res.status(201).json({ status: 'verification_required', email })
  }),
)

router.post(
  '/login',
  loginLimiter,
  asyncRoute(async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const { email, password } = parsed.data

    const result = await pool.query(
      'SELECT id, email, password_hash, email_verified_at, auth_version FROM users WHERE email = $1',
      [email],
    )
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
    if (!user.email_verified_at) {
      res.status(403).json({ error: 'Verify your email before logging in', code: 'EMAIL_NOT_VERIFIED' })
      return
    }

    const token = signToken({ sub: user.id, email: user.email, ver: user.auth_version })
    res.cookie('token', token, COOKIE_OPTIONS)
    res.json({ id: user.id, email: user.email })
  }),
)

router.post('/logout', (_req, res) => {
  res.clearCookie('token', COOKIE_CLEAR_OPTIONS)
  res.status(204).end()
})

router.post(
  '/verification/resend',
  emailRequestLimiter,
  asyncRoute(async (req, res) => {
    const parsed = emailSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
      return
    }

    const result = await pool.query(
      'SELECT id, email FROM users WHERE email = $1 AND email_verified_at IS NULL',
      [parsed.data.email],
    )
    const user = result.rows[0]
    if (user && !(await authTokenIssuedRecently(user.id, 'verify_email'))) {
      try {
        await deliverToken(user, 'verify_email')
      } catch (error) {
        // Keep the response neutral so this endpoint cannot disclose registered addresses.
        console.error('Could not send verification email', error)
      }
    }

    res.status(202).json({ message: 'If the account is pending verification, a new email will be sent.' })
  }),
)

router.post(
  '/verification/confirm',
  tokenActionLimiter,
  asyncRoute(async (req, res) => {
    const parsed = tokenRequestSchema.safeParse(req.body)
    if (!parsed.success || !(await verifyEmailWithToken(parsed.data.token))) {
      res.status(400).json({ error: 'This verification link is invalid or has expired.', code: 'INVALID_TOKEN' })
      return
    }
    res.status(204).end()
  }),
)

router.post(
  '/password/forgot',
  emailRequestLimiter,
  asyncRoute(async (req, res) => {
    const parsed = emailSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
      return
    }

    const result = await pool.query(
      'SELECT id, email FROM users WHERE email = $1 AND email_verified_at IS NOT NULL',
      [parsed.data.email],
    )
    const user = result.rows[0]
    if (user && !(await authTokenIssuedRecently(user.id, 'reset_password'))) {
      try {
        await deliverToken(user, 'reset_password')
      } catch (error) {
        // Keep the response neutral so this endpoint cannot disclose registered addresses.
        console.error('Could not send password reset email', error)
      }
    }

    res.status(202).json({ message: 'If a verified account exists, a password reset email will be sent.' })
  }),
)

router.post(
  '/password/reset',
  tokenActionLimiter,
  asyncRoute(async (req, res) => {
    const parsed = passwordResetSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
      return
    }

    const passwordHash = await hashPassword(parsed.data.password)
    if (!(await resetPasswordWithToken(parsed.data.token, passwordHash))) {
      res.status(400).json({ error: 'This password reset link is invalid or has expired.', code: 'INVALID_TOKEN' })
      return
    }

    res.clearCookie('token', COOKIE_CLEAR_OPTIONS)
    res.status(204).end()
  }),
)

router.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ id: req.user!.id, email: req.user!.email })
})

router.post('/mcp-token', requireAuth, (req: AuthedRequest, res) => {
  const token = signToken(
    { sub: req.user!.id, email: req.user!.email, ver: req.user!.authVersion },
    '3650d',
  )
  res.json({ token })
})

export default router
