import { createContext, useContext } from 'react'
import type { AccountProfile } from '../../shared/auth'

export const SESSION_TOKEN_STORAGE_KEY = 'uasa_nexus_session_token'

export function getStoredSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredSessionToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token)
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token)
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
      localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY)
    }
  } catch {
    // Abaikan jika storan tidak disokong
  }
}

export interface AccountSession {
  account: AccountProfile
  token: string
  logout: () => Promise<void>
}

export const AccountContext = createContext<AccountSession | null>(null)

export function useAccount(): AccountSession {
  const context = useContext(AccountContext)
  if (!context) throw new Error('Account session is unavailable')
  return context
}
