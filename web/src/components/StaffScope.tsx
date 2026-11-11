import { useEffect, useState } from 'react'
import { getStoredSessionToken } from '../lib/account-context'

interface Scope {
  schoolWide: boolean
  classes: { id: string; name: string; year: number }[]
  subjectAssignments: {
    classId: string; className: string; year: number; subjectId: string; subjectName: string
  }[]
}

export function StaffScope({ accountEmail }: { accountEmail: string }) {
  const [scope, setScope] = useState<Scope>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const token = getStoredSessionToken()
        if (!token) throw new Error()
        const response = await fetch('/api/staff/scope', {
          signal: controller.signal, headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error()
        const data = await response.json() as { scope: Scope }
        if (!controller.signal.aborted) setScope(data.scope)
      } catch {
        if (!controller.signal.aborted) setError('Skop akses belum dapat dimuatkan.')
      }
    }
    void load()
    return () => controller.abort()
  }, [accountEmail, attempt])

  return (
    <section className="content-card">
      <div className="card-heading">
        <div>
          <h2>Akses kelas dan subjek</h2>
          <p>Kelas dan tugasan yang dibenarkan untuk akaun anda.</p>
        </div>
      </div>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button className="secondary-button" type="button" onClick={() => {
            setError('')
            setAttempt((value) => value + 1)
          }}>Cuba lagi</button>
        </>
      ) : !scope ? <p role="status">Sedang memuatkan akses…</p> : (
        <>
          {scope.schoolWide && <p>Setiausaha peperiksaan: akses semua kelas dan subjek.</p>}
          {scope.classes.length > 0 && (
            <ul aria-label={scope.schoolWide ? 'Kelas sekolah' : 'Kelas jagaan'}>
              {scope.classes.map(c => <li key={c.id}>{c.name} ({c.year})</li>)}
            </ul>
          )}
          {scope.subjectAssignments.length > 0 && (
            <ul aria-label="Tugasan subjek">
              {scope.subjectAssignments.map(t => (
                <li key={t.classId + ':' + t.subjectId}>{t.subjectName} · {t.className} ({t.year})</li>
              ))}
            </ul>
          )}
          {!scope.classes.length && !scope.subjectAssignments.length && (
            <p>{scope.schoolWide ? 'Belum ada kelas didaftarkan.' : 'Belum ada kelas atau subjek ditugaskan.'}</p>
          )}
        </>
      )}
    </section>
  )
}
