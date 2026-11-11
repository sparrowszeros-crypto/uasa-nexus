import { createContext, useContext } from 'react'
import type { AccountProfile } from '../../shared/auth'
export interface AccountSession {
  account: AccountProfile
  logout: () => Promise<void>
}
export const AccountContext = createContext<AccountSession | null>(null)
export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) throw new Error('Account session is unavailable')
  return context
}
