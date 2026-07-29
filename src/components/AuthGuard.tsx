import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export function AuthGuard() {
  const status = useAuthStore((s) => s.status)
  const checkSession = useAuthStore((s) => s.checkSession)

  useEffect(() => {
    if (status === 'loading') checkSession()
  }, [status, checkSession])

  if (status === 'loading') return <div className="auth-guard__loading">Loading…</div>
  if (status === 'anonymous') return <Navigate to="/login" replace />
  return <Outlet />
}
