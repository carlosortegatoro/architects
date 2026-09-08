import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, authApi } from '../api/client'
import { authTokenFromLocation } from '../utils/authToken'
import { SpinnerIcon } from './Icon'

export function VerifyEmailScreen() {
  const [token] = useState(authTokenFromLocation)
  const [status, setStatus] = useState<'ready' | 'submitting' | 'success'>('ready')
  const [error, setError] = useState<string | null>(token ? null : 'This verification link is incomplete.')

  async function handleVerify() {
    if (!token) return
    setStatus('submitting')
    setError(null)
    try {
      await authApi.confirmVerification(token)
      window.history.replaceState(null, '', '/verify-email')
      setStatus('success')
    } catch (err) {
      setStatus('ready')
      setError(err instanceof ApiError ? err.message : 'Could not verify your email.')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-screen__form">
        <h1>{status === 'success' ? 'Email verified' : 'Verify your email'}</h1>
        {status === 'success' ? (
          <>
            <p className="login-screen__success">Your account is active. You can now log in.</p>
            <Link className="btn btn--primary login-screen__button-link" to="/login">
              Continue to login
            </Link>
          </>
        ) : (
          <>
            <p className="login-screen__message">Confirm this email address to activate your account.</p>
            {error && <p className="login-screen__error">{error}</p>}
            <button className="btn btn--primary" disabled={!token || status === 'submitting'} onClick={handleVerify}>
              {status === 'submitting' && <SpinnerIcon />}
              {status === 'submitting' ? 'Verifying…' : 'Verify email'}
            </button>
            <Link className="login-screen__link" to="/login">
              Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
