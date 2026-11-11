import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { FirebaseError } from 'firebase/app'
import {
  browserSessionPersistence,
  onIdTokenChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'
import { AccountContext } from '../lib/account-context'
import type { AccountProfile } from '../../shared/auth'

interface Props {
  children: ReactNode
}
type Session =
  | { kind: 'loading' }
  | { kind: 'signedOut'; error?: string }
  | { kind: 'signedIn'; account: AccountProfile }

function loginError(error: unknown) {
  if (error instanceof FirebaseError) {
    const messages: Record<string, string> = {
      'auth/popup-closed-by-user': 'Tetingkap log masuk ditutup. Sila cuba lagi.',
      'auth/popup-blocked': 'Pelayar menyekat tetingkap Google. Benarkan pop-up untuk laman ini.',
      'auth/unauthorized-domain': 'Domain laman ini belum dibenarkan dalam tetapan Firebase.',
      'auth/operation-not-allowed': 'Penyedia Google belum diaktifkan dalam Firebase.',
      'auth/network-request-failed': 'Sambungan ke Firebase gagal. Semak rangkaian dan cuba lagi.',
      'auth/user-disabled': 'Akaun telah dinyahaktifkan. Hubungi setiausaha peperiksaan.',
      'auth/cancelled-popup-request': 'Permintaan log masuk diganti. Cuba sekali lagi.',
    }
    return messages[error.code] ?? 'Log masuk Google tidak berjaya. Sila cuba lagi.'
  }
  return 'Perkhidmatan log masuk tidak dapat dihubungi. Sila cuba lagi.'
}

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const activeReq = useRef(0)
  const isMounted = useRef(true)

  const verifyUserSession = useCallback(async (user: User, forceRefresh = false) => {
    const reqId = ++activeReq.current
    setSession({ kind: 'loading' })

    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort('timeout')
    }, 15000)

    try {
      const token = await user.getIdToken(forceRefresh)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
        signal: controller.signal,
      })
      clearTimeout(timer)

      let data: { ok?: boolean; account?: AccountProfile; message?: string }
      try {
        data = await response.json()
      } catch {
        throw new Error('Pelayan memulangkan respons yang tidak sah.')
      }

      if (!isMounted.current || activeReq.current !== reqId) return

      if (!response.ok || data.ok !== true || !data.account) {
        setSession({
          kind: 'signedOut',
          error: data.message ?? 'Akses sistem tidak dibenarkan.',
        })
        return
      }

      setSession({ kind: 'signedIn', account: data.account })
    } catch (error: unknown) {
      clearTimeout(timer)
      if (!isMounted.current || activeReq.current !== reqId) return

      const isTimeout = controller.signal.aborted && controller.signal.reason === 'timeout'
      const message = isTimeout
        ? 'Pengesahan sesi mengambil masa terlalu lama. Sila cuba lagi.'
        : error instanceof Error
          ? error.message
          : 'Pelayan tidak dapat dihubungi. Sila cuba log masuk semula.'

      setSession({
        kind: 'signedOut',
        error: message,
      })
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    const unsubscribe = onIdTokenChanged(
      auth,
      (user) => {
        if (!isMounted.current) return
        if (!user) {
          setSession({ kind: 'signedOut' })
          return
        }
        void verifyUserSession(user)
      },
      () => {
        if (isMounted.current) {
          setSession({ kind: 'signedOut', error: 'Sesi Firebase gagal dibaca. Sila cuba lagi.' })
        }
      },
    )

    return () => {
      isMounted.current = false
      unsubscribe()
    }
  }, [verifyUserSession])

  async function login() {
    if (busy) return
    setBusy(true)
    setSession({ kind: 'loading' })
    try {
      await setPersistence(auth, browserSessionPersistence)
      const cred = await signInWithPopup(auth, googleProvider)
      if (cred.user) {
        await verifyUserSession(cred.user, true)
      }
    } catch (error) {
      setSession({ kind: 'signedOut', error: loginError(error) })
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    ++activeReq.current
    setSession({ kind: 'loading' })
    try {
      await signOut(auth)
      setSession({ kind: 'signedOut' })
    } catch {
      setSession({ kind: 'signedOut', error: 'Log keluar belum selesai. Cuba log keluar sekali lagi.' })
    }
  }

  if (session.kind === 'signedIn') {
    return <AccountContext.Provider value={{ account: session.account, logout }}>{children}</AccountContext.Provider>
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <a className="brand" href="/" aria-label="UASA Nexus">
          <span className="brand-icon">U</span>
          <span><strong>UASA Nexus</strong><small>Pengurusan Peperiksaan</small></span>
        </a>
        <div>
          <p className="eyebrow">PERALIHAN · TINGKATAN 1–3</p>
          <h1>Ruang peperiksaan sekolah anda.</h1>
          <p>Urus kelas, markah dan keputusan mengikut tanggungjawab yang ditugaskan.</p>
        </div>
        <small>Sesi pengujian · 2027</small>
      </section>
      <section className="login-content">
        <div className="login-card" aria-busy={busy || session.kind === 'loading'}>
          <p className="eyebrow">AKSES GURU & PENTADBIR</p>
          <h2>Selamat datang kembali</h2>
          <p>Gunakan akaun Google DELIMa aktif dengan alamat e-mel yang didaftarkan oleh setiausaha peperiksaan. Jika Google tidak menjumpai akaun anda, semak alamat e-mel dengan pentadbir DELIMa sekolah.</p>
          {session.kind === 'loading' ? (
            <div className="auth-loading-state">
              <p className="auth-status" role="status">Mengesahkan sesi dan kebenaran akses…</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void logout()}
                disabled={busy}
                style={{ marginTop: '0.75rem' }}
              >
                Batal / Tukar akaun
              </button>
            </div>
          ) : (
            <>
              {session.error && <p className="auth-error" role="alert">{session.error}</p>}
              <button className="login-button" onClick={() => void login()} disabled={busy} type="button">
                {busy ? 'Membuka log masuk…' : 'Log masuk dengan DELIMa'}
              </button>
              {auth.currentUser && (
                <button className="secondary-button" type="button" onClick={() => void logout()} disabled={busy}>
                  Log keluar / tukar akaun
                </button>
              )}
            </>
          )}
          <p className="login-note">Akses ibu bapa akan dibuka selepas modul pengaktifan akaun disediakan.</p>
        </div>
      </section>
    </main>
  )
}
