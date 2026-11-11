import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { FirebaseError } from 'firebase/app'
import { browserSessionPersistence, onIdTokenChanged, setPersistence, signInWithPopup, signOut } from 'firebase/auth'
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
  const generation = useRef(0)

  useEffect(() => {
    let mounted = true
    let pending: AbortController | undefined
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      const current = ++generation.current
      pending?.abort()
      if (!user) {
        setSession({ kind: 'signedOut' })
        return
      }
      setSession({ kind: 'loading' })
      const controller = new AbortController()
      pending = controller
      void (async () => {
        try {
          const token = await user.getIdToken()
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            cache: 'no-store',
            signal: controller.signal,
          })
          const data = await response.json()
          if (!mounted || generation.current !== current) return
          if (!response.ok || data.ok !== true || !data.account) {
            setSession({
              kind: 'signedOut',
              error: data.message ?? 'Akses sistem tidak dibenarkan.',
            })
            return
          }
          setSession({ kind: 'signedIn', account: data.account })
        } catch {
          if (mounted && generation.current === current && !controller.signal.aborted) {
            setSession({ kind: 'signedOut', error: 'Pelayan tidak dapat dihubungi. Sila cuba log masuk semula.' })
          }
        }
      })()
    }, () => {
      if (mounted) setSession({ kind: 'signedOut', error: 'Sesi Firebase gagal dibaca. Sila cuba lagi.' })
    })
    return () => {
      mounted = false
      pending?.abort()
      unsubscribe()
    }
  }, [])

  async function login() {
    if (busy) return
    setBusy(true)
    try {
      await setPersistence(auth, browserSessionPersistence)
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      setSession({ kind: 'signedOut', error: loginError(error) })
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    ++generation.current
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
            <p className="auth-status" role="status">Mengesahkan sesi dan kebenaran akses…</p>
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
