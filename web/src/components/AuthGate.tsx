import { useEffect, useRef, useState, useCallback, type ReactNode, type FormEvent } from 'react'
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
  | { kind: 'signedOut'; error?: string; locked?: boolean; remainingAttempts?: number }
  | { kind: 'signedIn'; account: AccountProfile; token: string }

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session>(() => {
    const token = typeof window !== 'undefined' ? getStoredSessionToken() : null
    return token ? { kind: 'loading' } : { kind: 'signedOut' }
  })
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaSvg, setCaptchaSvg] = useState('')
  const [captchaKey, setCaptchaKey] = useState('')
  const [loadingCaptcha, setLoadingCaptcha] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const activeReq = useRef(0)
  const isMounted = useRef(true)

  const refreshCaptcha = useCallback(async () => {
    setLoadingCaptcha(true)
    try {
      const res = await fetch('/api/auth/captcha', { cache: 'no-store' })
      const data = (await res.json()) as { ok: boolean; key: string; svg: string }
      if (data.ok && isMounted.current) {
        setCaptchaKey(data.key)
        setCaptchaSvg(data.svg)
        setCaptchaAnswer('')
      }
    } catch {
      // Abaikan ralat sementara rangkaian
    } finally {
      if (isMounted.current) setLoadingCaptcha(false)
    }
  }, [])

  // Semak sesi tersimpan dan muat captcha pada permulaan
  useEffect(() => {
    isMounted.current = true
    const controller = new AbortController()

    async function initSession() {
      const storedToken = getStoredSessionToken()
      if (storedToken) {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
            signal: controller.signal,
          })
          const data = (await res.json()) as { ok: boolean; account?: AccountProfile; message?: string }
          if (controller.signal.aborted) return

          if (res.ok && data.ok && data.account) {
            setSession({
              kind: 'signedIn',
              account: data.account,
              token: storedToken,
            })
            return
          }
          setStoredSessionToken(null)
          setSession({ kind: 'signedOut', error: data.message })
        } catch {
          if (controller.signal.aborted) return
          setStoredSessionToken(null)
          setSession({ kind: 'signedOut' })
        }
      }

      // Jika tiada sesi atau sesi telah luput, muatkan captcha
      try {
        const res = await fetch('/api/auth/captcha', { signal: controller.signal, cache: 'no-store' })
        const data = (await res.json()) as { ok: boolean; key: string; svg: string }
        if (!controller.signal.aborted && data.ok) {
          setCaptchaKey(data.key)
          setCaptchaSvg(data.svg)
        }
      } catch {
        // Abaikan pembatalan
      }
    }

    void initSession()

    return () => {
      isMounted.current = false
      controller.abort()
    }
  }, [])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    if (busy) return

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password
    const cleanCaptcha = captchaAnswer.trim()

    if (!cleanEmail || !cleanPassword) {
      setSession({ kind: 'signedOut', error: 'Sila masukkan e-mel dan kata laluan.' })
      return
    }

    if (!cleanCaptcha || !captchaKey) {
      setSession({ kind: 'signedOut', error: 'Sila lengkapkan kod keselamatan (captcha).' })
      return
    }

    setBusy(true)
    const reqId = ++activeReq.current

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          captchaKey,
          captchaAnswer: cleanCaptcha,
        }),
      })

      const data = (await res.json().catch(() => null)) as {
        ok: boolean
        token?: string
        account?: AccountProfile
        message?: string
        locked?: boolean
        remainingAttempts?: number
      } | null

      if (!isMounted.current || activeReq.current !== reqId) return

      if (res.ok && data?.ok && data.token && data.account) {
        setStoredSessionToken(data.token)
        setPassword('')
        setCaptchaAnswer('')
        setSession({
          kind: 'signedIn',
          account: data.account,
          token: data.token,
        })
      } else {
        // Segarkan captcha setiap kali cubaan gagal
        void refreshCaptcha()
        setSession({
          kind: 'signedOut',
          error: data?.message || 'Log masuk tidak berjaya. Sila cuba lagi.',
          locked: data?.locked,
          remainingAttempts: data?.remainingAttempts,
        })
      }
    } catch {
      if (!isMounted.current || activeReq.current !== reqId) return
      void refreshCaptcha()
      setSession({
        kind: 'signedOut',
        error: 'Pelayan tidak dapat dihubungi. Sila semak sambungan rangkaian.',
      })
    } finally {
      if (isMounted.current) setBusy(false)
    }
  }

  async function handleLogout() {
    setStoredSessionToken(null)
    setPassword('')
    setCaptchaAnswer('')
    setSession({ kind: 'signedOut' })
    void refreshCaptcha()
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
            Masukkan e-mel yang didaftarkan oleh setiausaha peperiksaan, kata laluan serta kod keselamatan.
          </p>

          {session.kind === 'loading' ? (
            <div className="auth-loading-state">
              <p className="auth-status" role="status">Mengesahkan sesi dan kelayakan akaun…</p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleLogin(e)} className="login-form">
              {session.error && (
                <div
                  className={`auth-alert ${session.locked ? 'auth-alert-locked' : 'auth-alert-error'}`}
                  role="alert"
                >
                  <strong>{session.locked ? 'Akaun Disekat' : 'Ralat Log Masuk'}</strong>
                  <p>{session.error}</p>
                  {session.locked && (
                    <small>Sila hubungi setiausaha peperiksaan untuk membuka semula sekatan akaun anda.</small>
                  )}
                </div>
              )}

              <div className="form-field">
                <label htmlFor="login-email">Alamat E-mel</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="cth: sparrowszeros@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div className="form-field">
                <div className="field-header">
                  <label htmlFor="login-password">Kata Laluan</label>
                  <button
                    type="button"
                    className="text-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? 'Sembunyi' : 'Lihat'}
                  </button>
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Masukkan kata laluan anda"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div className="form-field captcha-container">
                <label htmlFor="login-captcha">Kod Keselamatan (Captcha)</label>
                <div className="captcha-row">
                  <div
                    className="captcha-svg-wrapper"
                    dangerouslySetInnerHTML={{ __html: captchaSvg || '<span style="color:#64748b;font-size:12px;padding:8px;">Memuat kod...</span>' }}
                  />
                  <button
                    type="button"
                    className="captcha-refresh-btn"
                    onClick={() => void refreshCaptcha()}
                    disabled={loadingCaptcha || busy}
                    title="Tukar kod keselamatan"
                  >
                    {loadingCaptcha ? '…' : '↻ Tukar'}
                  </button>
                </div>
                <input
                  id="login-captcha"
                  type="text"
                  required
                  maxLength={4}
                  autoComplete="off"
                  placeholder="Masukkan 4 aksara di atas"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value.toUpperCase())}
                  disabled={busy}
                  style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600 }}
                />
              </div>

              <button className="login-button" type="submit" disabled={busy || !email || !password || !captchaAnswer}>
                {busy ? 'Mengesahkan log masuk…' : 'Log Masuk'}
              </button>

              <div className="login-footer-info">
                <small>Cubaan salah melebihi 3 kali akan menyekat akaun secara automatik.</small>
              </div>
            </form>
          )}

          <p className="login-note">
            Setiausaha Peperiksaan: <strong>sparrowszeros@gmail.com</strong>
          </p>
        </div>
      </section>
    </main>
  )
}
