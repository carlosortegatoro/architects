import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, authApi } from '../api/client'
import { authTokenFromLocation } from '../utils/authToken'
import { SpinnerIcon } from './Icon'

export function ResetPasswordScreen() {
  const [token] = useState(authTokenFromLocation)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : 'This password reset link is incomplete.')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('This password reset link is incomplete.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      await authApi.resetPassword(token, password)
      window.history.replaceState(null, '', '/reset-password')
      setComplete(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-screen__form" onSubmit={handleSubmit}>
        <h1>{complete ? 'Password updated' : 'Choose a new password'}</h1>
        {complete ? (
          <>
            <p className="login-screen__success">Your password has been changed and previous sessions were revoked.</p>
            <Link className="btn btn--primary login-screen__button-link" to="/login">
              Continue to login
            </Link>
          </>
        ) : (
          <>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            {error && <p className="login-screen__error">{error}</p>}
            <button className="btn btn--primary" type="submit" disabled={!token || submitting}>
              {submitting && <SpinnerIcon />}
              {submitting ? 'Updating…' : 'Update password'}
            </button>
            <Link className="login-screen__link" to="/login">
              Back to login
            </Link>
          </>
        )}
      </form>
    </div>
  )
}
