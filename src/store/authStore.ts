import { create } from 'zustand'
import { authApi, type CurrentUser, type RegistrationResult } from '../api/client'

type AuthState = {
  user: CurrentUser | null
  status: 'loading' | 'authenticated' | 'anonymous'
  checkSession: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<RegistrationResult>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  checkSession: async () => {
    try {
      const user = await authApi.me()
      set({ user, status: 'authenticated' })
    } catch {
      set({ user: null, status: 'anonymous' })
    }
  },

  login: async (email, password) => {
    const user = await authApi.login(email, password)
    set({ user, status: 'authenticated' })
  },

  register: async (email, password) => {
    const result = await authApi.register(email, password)
    set({ user: null, status: 'anonymous' })
    return result
  },

  logout: async () => {
    await authApi.logout()
    set({ user: null, status: 'anonymous' })
  },
}))
