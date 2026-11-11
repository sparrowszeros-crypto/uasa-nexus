import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import {
  signInWithPopup,
  signOut,
  onIdTokenChanged,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'
import {
  AccountContext,
  getStoredSessionToken,
  setStoredSessionToken,
} from '../lib/account-context'
import type { AccountProfile } from '../../shared/auth'

interface Props {
  children: ReactNode
}

type Session =
  | { kind: 'loading' }
  | { kind: 'signedOut'; error?: string }
  | { kind: 'signedIn'; account: AccountProfile; token: string }

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session>(() => {
    const token = typeof window !== 'undefined' ? getStoredSessionToken() : null
    return token ? { kind: 'loading' } : { kind: 'signedOut' }
  })
  const [busy, setBusy] = useState(false)

  const activeReq = useRef(0)
  const isMounted = useRef(true)

  const verifyTokenWithBackend = useCallback(async (token: string, signal?: AbortSignal) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      account?: AccountProfile
      message?: string
    } | null
    return {
      ok: res.ok && data?.ok === true && Boolean(data.account),
      account: data?.account,
      message: data?.message,
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    const controller = new AbortController()

    // 1. Semak sesi tersimpan
    const storedToken = getStoredSessionToken()
    if (storedToken) {
      verifyTokenWithBackend(storedToken, controller.signal)
        .then((result) => {
          if (!isMounted.current) return
          if (result.ok && result.account) {
            setSession({
              kind: 'signedIn',
              account: result.account,
              token: storedToken,
            })
          } else {
            setStoredSessionToken(null)
            setSession({ kind: 'signedOut', error: result.message })
          }
        })
        .catch(() => {
          if (!isMounted.current) return
          setStoredSessionToken(null)
          setSession({ kind: 'signedOut' })
        })
    }

    // 2. Dengar perubahan pengguna Firebase
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser: User | null) => {
      if (!isMounted.current) return
      if (!firebaseUser) {
        if (!getStoredSessionToken()) {
          setSession({ kind: 'signedOut' })
        }
        return
      }

      try {
        const idToken = await firebaseUser.getIdToken()
        const result = await verifyTokenWithBackend(idToken)
        if (!isMounted.current) return
        if (result.ok && result.account) {
          setStoredSessionToken(idToken)
          setSession({
            kind: 'signedIn',
            account: result.account,
            token: idToken,
          })
        } else {
          setStoredSessionToken(null)
          setSession({
            kind: 'signedOut',
            error: result.message || 'Akaun Google anda belum didaftarkan oleh setiausaha peperiksaan.',
          })
        }
      } catch {
        if (isMounted.current) {
          setStoredSessionToken(null)
          setSession({ kind: 'signedOut', error: 'Sesi Firebase gagal disahkan. Sila cuba lagi.' })
        }
      }
    })

    return () => {
      isMounted.current = false
      controller.abort()
      unsubscribe()
    }
  }, [verifyTokenWithBackend])

  async function handleGoogleLogin() {
    if (busy) return
    setBusy(true)
    setSession({ kind: 'loading' })
    const reqId = ++activeReq.current

    try {
      const cred = await signInWithPopup(auth, googleProvider)
      if (!cred.user) throw new Error('Akaun Google tidak dipilih.')

      const token = await cred.user.getIdToken(true)
      const result = await verifyTokenWithBackend(token)

      if (!isMounted.current || activeReq.current !== reqId) return

      if (result.ok && result.account) {
        setStoredSessionToken(token)
        setSession({
          kind: 'signedIn',
          account: result.account,
          token,
        })
      } else {
        await signOut(auth).catch(() => {})
        setStoredSessionToken(null)
        setSession({
          kind: 'signedOut',
          error: result.message || 'Akaun Google ini belum didaftarkan sebagai guru atau pentadbir.',
        })
      }
    } catch (error: unknown) {
      if (!isMounted.current || activeReq.current !== reqId) return
      const code = (error as { code?: string })?.code
      const msg = code === 'auth/popup-closed-by-user'
        ? 'Tetingkap log masuk Google ditutup sebelum selesai.'
        : code === 'auth/popup-blocked'
          ? 'Pelayar menyekat tetingkap Google. Sila benarkan pop-up bagi laman ini.'
          : 'Log masuk Google Firebase tidak berjaya. Sila cuba lagi.'
      setSession({ kind: 'signedOut', error: msg })
    } finally {
      if (isMounted.current) setBusy(false)
    }
  }

  async function handleLogout() {
    setStoredSessionToken(null)
    setBusy(false)
    await signOut(auth).catch(() => {})
    setSession({ kind: 'signedOut' })
  }

  if (session.kind === 'signedIn') {
    return (
      <AccountContext.Provider
        value={{
          account: session.account,
          token: session.token,
          logout: handleLogout,
        }}
      >
        {children}
      </AccountContext.Provider>
    )
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <a className="brand" href="/" aria-label="UASA Nexus">
          <span className="brand-icon">U</span>
          <span>
            <strong>UASA Nexus</strong>
            <small>Pengurusan Peperiksaan</small>
          </span>
        </a>
        <div>
          <p className="eyebrow">PERALIHAN · TINGKATAN 1–3</p>
          <h1>Ruang peperiksaan sekolah anda.</h1>
          <p>Urus kelas, markah dan keputusan mengikut tanggungjawab yang ditugaskan.</p>
        </div>
        <small>Sesi Pengurusan Peperiksaan</small>
      </section>

      <section className="login-content">
        <div className="login-card" aria-busy={busy || session.kind === 'loading'}>
          <p className="eyebrow">AKSES SISTEM GURU & PENTADBIR</p>
          <h2>Log Masuk Sistem</h2>
          <p>
            Gunakan akaun Google yang didaftarkan oleh setiausaha peperiksaan (DELIMa atau akaun Google peribadi).
          </p>

          {session.kind === 'loading' ? (
            <div className="auth-loading-state">
              <p className="auth-status" role="status">Mengesahkan sesi dan kebenaran akaun…</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void handleLogout()}
                style={{ marginTop: '1rem', width: '100%' }}
              >
                Batal / Tukar Akaun
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '24px' }}>
              {session.error && (
                <div className="auth-error" role="alert" style={{ marginBottom: '20px' }}>
                  <p>{session.error}</p>
                </div>
              )}

              <button
                className="login-button"
                type="button"
                onClick={() => void handleGoogleLogin()}
                disabled={busy}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
              >
                <span>{busy ? 'Membuka tetingkap log masuk…' : 'Log Masuk dengan Google'}</span>
              </button>

              {auth.currentUser && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={busy}
                  style={{ width: '100%', marginTop: '10px' }}
                >
                  Log Keluar / Tukar Akaun
                </button>
              )}
            </div>
          )}

          <p className="login-note">
            Setiausaha Peperiksaan: <strong>sparrowszeros@gmail.com</strong>
          </p>
        </div>
      </section>
    </main>
  )
}
