import { useEffect, useState, type FormEvent } from 'react'
import { getStoredSessionToken } from '../lib/account-context'
import type { Exam, ExamStatus } from '../../shared/exams'
import './SchoolSetup.css'

const statusLabels: Record<ExamStatus, { text: string; color: string }> = {
  draft: { text: 'Draf', color: '#64748b' },
  submitted: { text: 'Kemasukan Markah Dibuka', color: '#0369a1' },
  verified: { text: 'Disemak', color: '#d97706' },
  published: { text: 'Keputusan Diterbitkan', color: '#16a34a' },
}

export function ExamsManagement({ email }: { email?: string }) {
  void email
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(() => Boolean(getStoredSessionToken()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string }>()

  const [name, setName] = useState('')
  const [year, setYear] = useState(2027)
  const [deadline, setDeadline] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const token = getStoredSessionToken()
    if (!token) {
      return () => controller.abort()
    }

    fetch('/api/staff/exams', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as { ok: boolean; exams?: Exam[]; message?: string }
        if (controller.signal.aborted) return
        if (res.ok && data.exams) {
          setExams(data.exams)
        } else {
          setError(data.message || 'Senarai peperiksaan tidak dapat dimuatkan.')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Ralat sambungan pelayan.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  async function loadExams() {
    const token = getStoredSessionToken()
    if (!token) return
    try {
      const res = await fetch('/api/staff/exams', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { ok: boolean; exams?: Exam[]; message?: string }
      if (res.ok && data.exams) {
        setExams(data.exams)
      } else {
        setError(data.message || 'Senarai peperiksaan tidak dapat dimuatkan.')
      }
    } catch {
      setError('Ralat sambungan pelayan.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const token = getStoredSessionToken()
    if (!token) return

    setBusy(true)
    setNotice(undefined)

    try {
      const res = await fetch('/api/staff/exams', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          name,
          year,
          marksDeadline: deadline || null,
        }),
      })

      const data = (await res.json()) as { ok: boolean; exam?: Exam; message?: string }
      if (res.ok && data.ok) {
        setName('')
        setDeadline('')
        setNotice({ ok: true, text: 'Peperiksaan berjaya dicipta.' })
        await loadExams()
      } else {
        setNotice({ ok: false, text: data.message || 'Gagal mencipta peperiksaan.' })
      }
    } catch {
      setNotice({ ok: false, text: 'Ralat sambungan pelayan.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleStatusChange(examId: string, newStatus: ExamStatus) {
    if (busy) return
    const token = getStoredSessionToken()
    if (!token) return

    setBusy(true)
    setNotice(undefined)

    try {
      const res = await fetch('/api/staff/exams', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'status',
          examId,
          status: newStatus,
        }),
      })

      const data = (await res.json()) as { ok: boolean; message?: string }
      if (res.ok && data.ok) {
        setNotice({ ok: true, text: 'Status peperiksaan berjaya dikemaskini.' })
        await loadExams()
      } else {
        setNotice({ ok: false, text: data.message || 'Gagal mengemaskini status.' })
      }
    } catch {
      setNotice({ ok: false, text: 'Ralat sambungan pelayan.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-panel">
      {notice && (
        <p className={notice.ok ? 'setup-success' : 'setup-error'} role={notice.ok ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}

      {error && <p className="setup-error" role="alert">{error}</p>}

      <section className="content-card">
        <h2>Cipta Sesi Peperiksaan</h2>
        <p>Tetapkan sesi peperiksaan baharu bagi membolehkan guru subjek memasukkan markah.</p>

        <form onSubmit={(e) => void handleCreate(e)}>
          <fieldset disabled={busy} className="setup-fields">
            <label>
              Nama Peperiksaan
              <input
                type="text"
                required
                maxLength={100}
                placeholder="Contoh: Ujian Akhir Sesi Akademik (UASA)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label>
              Sesi Akademik
              <input
                type="number"
                min={2020}
                max={2100}
                required
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>

            <label>
              Tarikh Akhir Kemasukan Markah (Pilihan)
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>

            <button className="secondary-button" type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Menyimpan…' : 'Cipta Peperiksaan'}
            </button>
          </fieldset>
        </form>
      </section>

      <section className="content-card">
        <h2>Senarai Peperiksaan Sekolah ({exams.length})</h2>
        {loading ? (
          <p role="status">Memuatkan senarai peperiksaan…</p>
        ) : exams.length === 0 ? (
          <p>Belum ada peperiksaan didaftarkan. Cipta peperiksaan pertama di atas.</p>
        ) : (
          <ul className="setup-list">
            {exams.map((exam) => {
              const statusInfo = statusLabels[exam.status] || { text: exam.status, color: '#334155' }
              return (
                <li key={exam.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <strong style={{ fontSize: '16px' }}>{exam.name}</strong>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      <span>Sesi: {exam.year}</span>
                      {exam.marksDeadline && (
                        <span> · Tarikh Akhir: {new Date(exam.marksDeadline).toLocaleDateString('ms-MY')}</span>
                      )}
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: `${statusInfo.color}15`,
                          color: statusInfo.color,
                          border: `1px solid ${statusInfo.color}40`,
                        }}
                      >
                        {statusInfo.text}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {exam.status === 'draft' && (
                      <button
                        type="button"
                        className="secondary-button"
                        style={{ borderColor: '#0284c7', color: '#0369a1' }}
                        disabled={busy}
                        onClick={() => void handleStatusChange(exam.id, 'submitted')}
                      >
                        Buka Kemasukan Markah
                      </button>
                    )}

                    {exam.status === 'submitted' && (
                      <>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => void handleStatusChange(exam.id, 'draft')}
                        >
                          Tutup Kemasukan
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          style={{ borderColor: '#16a34a', color: '#15803d' }}
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm('Terbitkan keputusan peperiksaan ini? Keputusan akan dapat dilihat pada slip peperiksaan.')) {
                              void handleStatusChange(exam.id, 'published')
                            }
                          }}
                        >
                          Terbitkan Keputusan
                        </button>
                      </>
                    )}

                    {exam.status === 'published' && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Tarik balik penerbitan keputusan?')) {
                            void handleStatusChange(exam.id, 'submitted')
                          }
                        }}
                      >
                        Batal Penerbitan
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
