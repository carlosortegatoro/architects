import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ALLOWED_EMAIL_ERROR, isAllowedEmailAddress } from '../../shared/emailPolicy'
import { ApiError, authApi } from '../api/client'
import { SpinnerIcon } from './Icon'

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isAllowedEmailAddress(email)) {
      setError(ALLOWED_EMAIL_ERROR)
      return
    }

    setSubmitting(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-screen__form" onSubmit={handleSubmit}>
        <h1>Reset your password</h1>
        {sent ? (
          <p className="login-screen__success">
            If a verified account exists for that address, a password reset email will be sent.
          </p>
        ) : (
          <>
            <p className="login-screen__message">Enter the email address associated with your account.</p>
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
            {error && <p className="login-screen__error">{error}</p>}
            <button className="btn btn--primary" type="submit" disabled={submitting}>
              {submitting && <SpinnerIcon />}
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}
        <Link className="login-screen__link" to="/login">
          Back to login
        </Link>
      </form>
    </div>
  )
}
