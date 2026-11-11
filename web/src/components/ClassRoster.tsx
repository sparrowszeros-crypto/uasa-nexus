import { useEffect, useState, type FormEvent } from 'react'
import { getStoredSessionToken } from '../lib/account-context'
import type { ExitStatus, Pupil, RosterClass, RosterCommand } from '../../shared/roster'
import './SchoolSetup.css'

const statusNames = { active: 'Aktif', transferred: 'Pindah sekolah', removed: 'Dibuang sekolah' }
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
const value = (form: FormData, key: string) => String(form.get(key) ?? '')

async function rosterRequest(_email: string, classId?: string, signal?: AbortSignal, command?: RosterCommand) {
  const token = getStoredSessionToken()
  if (!token) throw new Error('Sila log masuk semula.')
  const headers = new Headers({ Authorization: 'Bearer ' + token })
  if (command) headers.set('Content-Type', 'application/json')
  const response = await fetch('/api/staff/class-roster' + (classId ? '?classId=' + encodeURIComponent(classId) : ''), {
    signal, headers, method: command ? 'POST' : 'GET', body: command ? JSON.stringify(command) : undefined,
  })
  const data = await response.json().catch(() => null) as {
    ok: boolean; message?: string; classes?: RosterClass[]; pupils?: Pupil[]
  } | null
  if (!response.ok || !data?.ok) throw new Error(data?.message || 'Permintaan belum berjaya. Sila cuba lagi.')
  return data
}

export function ClassRoster({ email }: { email: string }) {
  const [classes, setClasses] = useState<RosterClass[]>()
  const [chosen, setChosen] = useState('')
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    rosterRequest(email, undefined, controller.signal)
      .then(r => { if (!controller.signal.aborted) setClasses(r.classes ?? []) })
      .catch(() => { if (!controller.signal.aborted) setError('Senarai kelas belum dapat dimuatkan.') })
    return () => controller.abort()
  }, [email, retry])

  const selected = classes?.find(c => c.id === chosen) ?? classes?.[0]

  return (
    <section className="content-card">
      <h2>Senarai murid</h2>
      {error ? <><p role="alert">{error}</p><button className="secondary-button" type="button" onClick={() => {
        setError('')
        setRetry(v => v + 1)
      }}>Cuba lagi</button></> : !classes ? <p role="status">Sedang memuatkan kelas…</p>
        : !selected ? <p>Tiada kelas tersedia untuk akaun anda.</p>
        : <>
          <div className="setup-fields">
            <label>Kelas<select value={selected.id} onChange={e => setChosen(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} · {c.year}</option>)}
            </select></label>
          </div>
          <RosterRows key={selected.id} cls={selected} email={email} />
        </>}
    </section>
  )
}

function RosterRows({ cls, email }: { cls: RosterClass; email: string }) {
  const [pupils, setPupils] = useState<Pupil[]>()
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; message: string }>()
  const [editing, setEditing] = useState<{ id: string; action: 'rename' | 'exit' }>()
  const classId = cls.id

  useEffect(() => {
    const controller = new AbortController()
    rosterRequest(email, classId, controller.signal)
      .then(r => { if (!controller.signal.aborted) setPupils(r.pupils ?? []) })
      .catch(e => {
        if (!controller.signal.aborted) setLoadError(e instanceof Error ? e.message : 'Senarai murid belum dapat dimuatkan.')
      })
    return () => controller.abort()
  }, [email, classId, retry])

  function reload() {
    setPupils(undefined)
    setLoadError('')
    setRetry(n => n + 1)
  }

  async function save(form: HTMLFormElement, command: RosterCommand, message: string) {
    if (busy || !pupils || loadError) return
    setNotice(undefined)
    setBusy(true)
    try {
      await rosterRequest(email, undefined, undefined, command)
      form.reset()
      setEditing(undefined)
      setNotice({ ok: true, message })
      reload()
    } catch (e) {
      setNotice({ ok: false, message: e instanceof Error ? e.message : 'Perubahan belum disimpan.' })
    } finally {
      setBusy(false)
    }
  }

  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const d = new FormData(event.currentTarget)
    void save(event.currentTarget, {
      action: 'register', classId, number: value(d, 'number'), name: value(d, 'name'), date: value(d, 'date'),
    }, 'Murid berjaya didaftarkan.')
  }

  const currentDate = today()
  const startDefault = currentDate.startsWith(cls.year + '-') ? currentDate : cls.year + '-01-01'
  const activeCount = pupils?.filter(p => p.status === 'active' && !p.endsOn).length

  if (loadError) return <><p role="alert">{loadError}</p><button type="button" className="secondary-button" onClick={reload}>Muatkan semula</button></>

  return (
    <>
      {notice && <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'setup-success' : 'setup-error'}>{notice.message}</p>}
      <h3>Daftar murid baharu</h3>
      <form onSubmit={register}>
        <fieldset className="setup-fields" disabled={busy || !pupils}>
          <label>Nombor daftar sekolah<input name="number" required maxLength={30} autoComplete="off" /></label>
          <label>Nama penuh<input name="name" required maxLength={150} autoComplete="off" /></label>
          <label>Tarikh mula<input name="date" type="date" defaultValue={startDefault} min={cls.year + '-01-01'} max={cls.year + '-12-31'} required /></label>
          <button type="submit" className="secondary-button">Daftar murid</button>
        </fieldset>
      </form>
      {!pupils ? <p role="status">Sedang memuatkan murid…</p>
        : !pupils.length ? <p>Belum ada murid didaftarkan dalam kelas ini.</p>
        : <>
          <h3>Murid berdaftar ({pupils.length}) · {activeCount} aktif</h3>
          <ul className="setup-list">
            {pupils.map(p => (
              <li key={p.id + ':' + p.startsOn}>
                <div><strong>{p.name}</strong>
                  <span>{p.number} · {p.endsOn && p.status === 'active' ? 'Pendaftaran tamat' : statusNames[p.status]}</span>
                  <span>Mula: {p.startsOn}{p.endsOn ? ' · Tamat: ' + p.endsOn : ''}</span>
                </div>
                {!p.endsOn && p.status === 'active' && editing?.id !== p.id && <div>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => { setNotice(undefined); setEditing({ id: p.id, action: 'rename' }) }}>Betulkan nama</button>
                  <button type="button" className="secondary-button" disabled={busy || p.startsOn > currentDate} onClick={() => { setNotice(undefined); setEditing({ id: p.id, action: 'exit' }) }}>Kemas kini status</button>
                </div>}
                {!p.endsOn && editing?.id === p.id && <form className="roster-edit" onSubmit={event => {
                  event.preventDefault()
                  const form = event.currentTarget
                  const d = new FormData(form)
                  if (editing.action === 'rename') {
                    void save(form, { action: 'rename', classId, studentId: p.id, name: value(d, 'name') }, 'Nama murid dikemas kini.')
                  } else {
                    const status = value(d, 'status') as ExitStatus
                    if (window.confirm('Sahkan status “' + statusNames[status] + '” untuk ' + p.name + '? Pendaftaran kelas akan ditamatkan.')) {
                      void save(form, { action: 'exit', classId, studentId: p.id, status, date: value(d, 'date') }, 'Status dikemas kini. Sejarah murid dikekalkan.')
                    }
                  }
                }}>
                  <fieldset className="setup-fields" disabled={busy}>
                    {editing.action === 'rename' ? <label>Nama penuh<input name="name" defaultValue={p.name} maxLength={150} required /></label>
                      : <>
                        <label>Status baharu<select name="status" defaultValue="" required>
                          <option value="" disabled>Pilih status</option>
                          <option value="transferred">Pindah sekolah</option>
                          <option value="removed">Dibuang sekolah</option>
                        </select></label>
                        <label>Tarikh keluar<input name="date" type="date" defaultValue={currentDate} min={p.startsOn} max={currentDate} required /></label>
                      </>}
                    <button type="submit" className="secondary-button">Simpan</button>
                    <button type="button" className="secondary-button" onClick={() => setEditing(undefined)}>Batal</button>
                  </fieldset>
                </form>}
              </li>
            ))}
          </ul>
        </>}
    </>
  )
}
