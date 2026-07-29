import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ApiError } from '../api/client'
import { SpinnerIcon } from './Icon'

const DOMAIN_RE = /^[^@\s]+@salesforce\.com$/i

export function LoginScreen() {
  const status = useAuthStore((s) => s.status)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'authenticated') return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!DOMAIN_RE.test(email)) {
      setError('Email must be a @salesforce.com address')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
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
            required
          />
        </label>
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
