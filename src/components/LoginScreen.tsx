import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ALLOWED_EMAIL_ERROR, isAllowedEmailAddress } from '../../shared/emailPolicy'
import { useAuthStore } from '../store/authStore'
import { ApiError, authApi } from '../api/client'
import { SpinnerIcon } from './Icon'

export function LoginScreen() {
  const status = useAuthStore((s) => s.status)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const checkSession = useAuthStore((s) => s.checkSession)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null)
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') checkSession()
  }, [status, checkSession])

  if (status === 'authenticated') return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isAllowedEmailAddress(email)) {
      setError(ALLOWED_EMAIL_ERROR)
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') await login(email, password)
      else {
        const result = await register(email, password)
        setPendingVerificationEmail(result.email)
        setPassword('')
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setPendingVerificationEmail(email.trim().toLowerCase())
        setPassword('')
      } else if (err instanceof ApiError && err.code === 'EMAIL_SEND_FAILED') {
        setPendingVerificationEmail(email.trim().toLowerCase())
        setPassword('')
        setError(err.message)
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (!pendingVerificationEmail) return
    setError(null)
    setResendMessage(null)
    setSubmitting(true)
    try {
      const result = await authApi.resendVerification(pendingVerificationEmail)
      setResendMessage(result.message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (pendingVerificationEmail) {
    return (
      <div className="login-screen">
        <div className="login-screen__form">
          <h1>Check your email</h1>
          <p className="login-screen__message">
            We sent a verification link to <strong>{pendingVerificationEmail}</strong>. Your account will remain
            inactive until you verify the address.
          </p>
          {resendMessage && <p className="login-screen__success">{resendMessage}</p>}
          {error && <p className="login-screen__error">{error}</p>}
          <button className="btn btn--primary" type="button" disabled={submitting} onClick={handleResend}>
            {submitting && <SpinnerIcon />}
            {submitting ? 'Sending…' : 'Resend verification email'}
          </button>
          <button
            type="button"
            className="login-screen__switch"
            onClick={() => {
              setPendingVerificationEmail(null)
              setResendMessage(null)
              setError(null)
              setMode('login')
            }}
          >
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <form className="login-screen__form" onSubmit={handleSubmit}>
        <h1>Architecture Editor</h1>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@salesforce.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>
        {mode === 'login' && (
          <Link className="login-screen__link" to="/forgot-password">
            Forgot your password?
          </Link>
        )}
        {error && <p className="login-screen__error">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting && <SpinnerIcon />}
          {submitting
            ? mode === 'login' ? 'Logging in…' : 'Creating account…'
            : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        <button
          type="button"
          className="login-screen__switch"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Log in'}
        </button>
      </form>
    </div>
  )
}
