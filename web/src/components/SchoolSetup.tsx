import { useEffect, useState, type FormEvent } from 'react'
import { getStoredSessionToken } from '../lib/account-context'
import { levels, teacherRoles, type SchoolSetup, type SetupCommand } from '../../shared/setup'
import './SchoolSetup.css'

const roleNames = { class_teacher: 'Guru Kelas', subject_teacher: 'Guru Subjek' }
const levelName = (level: string) => level === 'PERALIHAN' ? 'Peralihan' : 'Tingkatan ' + level
const className = (c: SchoolSetup['classes'][number]) => c.name + ' · ' + c.year

async function request(_email: string, signal?: AbortSignal, command?: SetupCommand) {
  const token = getStoredSessionToken()
  if (!token) throw new Error('Sila log masuk semula.')
  const headers = new Headers({ Authorization: 'Bearer ' + token })
  if (command) headers.set('Content-Type', 'application/json')
  const response = await fetch('/api/admin/school-setup', {
    method: command ? 'POST' : 'GET', headers, signal,
    body: command ? JSON.stringify(command) : undefined,
  })
  const data = await response.json() as { ok: boolean; setup?: SchoolSetup; message?: string }
  if (!response.ok || !data.ok) throw new Error(data.message || 'Permintaan tidak berjaya.')
  return data.setup
}

export function SchoolSetupPanel({ email, page, onClassCreated }: { email: string; page: 'classes' | 'teachers'; onClassCreated?: () => void }) {
  const [setup, setSetup] = useState<SchoolSetup>()
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string }>()
  const [assignmentType, setAssignmentType] = useState<'class_teacher' | 'subject_teacher'>('class_teacher')

  useEffect(() => {
    const controller = new AbortController()
    request(email, controller.signal)
      .then(data => { if (!controller.signal.aborted && data) setSetup(data) })
      .catch(() => { if (!controller.signal.aborted) setLoadError('Senarai penetapan tidak dapat dimuatkan.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [email, refresh])

  function reload() {
    setLoadError('')
    setLoading(true)
    setRefresh(n => n + 1)
  }

  async function save(command: SetupCommand, message: string, form?: HTMLFormElement) {
    if (busy || loading || loadError) return
    setNotice(undefined)
    setBusy(true)
    try {
      await request(email, undefined, command)
      form?.reset()
      setNotice({ ok: true, text: message })
      if (command.action === 'class') onClassCreated?.()
      reload()
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Perubahan gagal disimpan.' })
    } finally {
      setBusy(false)
    }
  }

  function submit(make: (data: FormData) => SetupCommand, message: string) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = event.currentTarget
      void save(make(new FormData(form)), message, form)
    }
  }

  const field = (data: FormData, name: string) => String(data.get(name) ?? '')
  const disabled = busy || loading || Boolean(loadError)
  const eligibleTeachers = setup?.teachers.filter(t => t.roles.includes(assignmentType)) ?? []
  const activeSubjects = setup?.subjects.filter(s => s.active) ?? []
  const canAssign = eligibleTeachers.length > 0 && Boolean(setup?.classes.length)
    && (assignmentType === 'class_teacher' || activeSubjects.length > 0)
  const teacherById = new Map(setup?.teachers.map(t => [t.id, t]))
  const classById = new Map(setup?.classes.map(c => [c.id, c]))
  const subjectById = new Map(setup?.subjects.map(s => [s.id, s]))

  return (
    <div className="setup-panel">
      {loading && <p role="status">Sedang memuatkan senarai…</p>}
      {loadError && <div role="alert"><p>{loadError}</p>
        <button className="secondary-button" type="button" onClick={reload}>Muatkan semula</button>
      </div>}
      {notice && <p className={notice.ok ? 'setup-success' : 'setup-error'} role={notice.ok ? 'status' : 'alert'}>{notice.text}</p>}
      {setup && (page === 'classes' ? (
        <>
          <section className="content-card">
            <h2>Daftar kelas</h2>
            <form onSubmit={submit(d => ({
              action: 'class', name: field(d, 'name'), year: Number(field(d, 'year')),
              level: field(d, 'level') as typeof levels[number],
            }), 'Kelas berjaya didaftarkan.')}>
              <fieldset disabled={disabled} className="setup-fields">
                <label>Sesi akademik<input name="year" type="number" defaultValue={2027} min={2020} max={2100} required /></label>
                <label>Tahap<select name="level" defaultValue="1">{levels.map(l => <option key={l} value={l}>{levelName(l)}</option>)}</select></label>
                <label>Nama kelas<input name="name" placeholder="Contoh: 1 Amanah" required maxLength={80} /></label>
                <button className="secondary-button" type="submit">Simpan kelas</button>
              </fieldset>
            </form>
            <h3>Kelas berdaftar ({setup.classes.length})</h3>
            {setup.classes.length ? <ul className="setup-list">{setup.classes.map(c =>
              <li key={c.id}><strong>{c.name}</strong><span>{levelName(c.level)} · {c.year}</span></li>,
            )}</ul> : <p>Belum ada kelas didaftarkan.</p>}
          </section>
          <section className="content-card">
            <h2>Daftar subjek</h2>
            <form onSubmit={submit(d => ({ action: 'subject', code: field(d, 'code'), name: field(d, 'name') }), 'Subjek berjaya didaftarkan.')}>
              <fieldset disabled={disabled} className="setup-fields">
                <label>Kod subjek<input name="code" placeholder="Contoh: MAT" required maxLength={16} /></label>
                <label>Nama subjek<input name="name" placeholder="Contoh: Matematik" required maxLength={100} /></label>
                <button className="secondary-button" type="submit">Simpan subjek</button>
              </fieldset>
            </form>
            <h3>Subjek berdaftar ({setup.subjects.length})</h3>
            {setup.subjects.length ? <ul className="setup-list">{setup.subjects.map(s =>
              <li key={s.id}><strong>{s.name}</strong><span>{s.code}{s.active ? '' : ' · Tidak aktif'}</span></li>,
            )}</ul> : <p>Belum ada subjek didaftarkan.</p>}
          </section>
        </>
      ) : (
        <>
          <section className="content-card">
            <h2>Daftar guru</h2>
            <p>Daftarkan alamat e-mel Google atau DELIMa guru. Guru akan log masuk menggunakan akaun Google yang didaftarkan.</p>
            <form onSubmit={submit(d => ({
              action: 'teacher', email: field(d, 'email'), name: field(d, 'name'),
              roles: teacherRoles.filter(r => d.has(r)),
            }), 'Guru berjaya didaftarkan.')}>
              <fieldset disabled={disabled} className="setup-fields">
                <label>Nama guru<input name="name" autoComplete="off" required maxLength={120} /></label>
                <label>Alamat e-mel Google / DELIMa guru<input name="email" type="email" placeholder="cth: guru@gmail.com" autoComplete="off" required maxLength={254} /></label>
                <div className="setup-roles" role="group" aria-label="Peranan guru">
                  {teacherRoles.map(r => <label key={r}><input name={r} type="checkbox" />{roleNames[r]}</label>)}
                </div>
                <button className="secondary-button" type="submit">Daftar guru</button>
              </fieldset>
            </form>
            <h3>Guru berdaftar ({setup.teachers.length})</h3>
            {setup.teachers.length ? <ul className="setup-list">{setup.teachers.map(t =>
              <li key={t.id}>
                <strong>{t.name}</strong>
                <span>{t.email} · {t.roles.map(r => roleNames[r]).join(', ')}</span>
              </li>,
            )}</ul> : <p>Belum ada guru didaftarkan.</p>}
          </section>
          <section className="content-card">
            <h2>Tetapkan tugasan guru</h2>
            <form onSubmit={submit(d => ({
              action: 'grant', teacherId: field(d, 'teacher'), classId: field(d, 'class'),
              subjectId: assignmentType === 'class_teacher' ? null : field(d, 'subject'),
            }), 'Tugasan berjaya disimpan.')}>
              <fieldset disabled={disabled} className="setup-fields">
                <label>Jenis tugasan<select value={assignmentType} onChange={e =>
                  setAssignmentType(e.target.value as typeof assignmentType)}>
                  {teacherRoles.map(r => <option key={r} value={r}>{roleNames[r]}</option>)}
                </select></label>
                <label>Guru<select key={assignmentType} name="teacher" defaultValue="" required>
                  <option value="">Pilih guru</option>
                  {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
                </select></label>
                <label>Kelas<select name="class" defaultValue="" required>
                  <option value="">Pilih kelas</option>
                  {setup.classes.map(c => <option key={c.id} value={c.id}>{className(c)}</option>)}
                </select></label>
                {assignmentType === 'subject_teacher' && <label>Subjek<select name="subject" defaultValue="" required>
                  <option value="">Pilih subjek</option>
                  {activeSubjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select></label>}
                <button className="secondary-button" type="submit" disabled={!canAssign}>Simpan tugasan</button>
              </fieldset>
              {!canAssign && <p>Daftarkan kelas dan guru dengan peranan yang dipilih. Untuk guru subjek, daftarkan juga subjek.</p>}
            </form>
            <h3>Tugasan semasa ({setup.assignments.length})</h3>
            {setup.assignments.length ? <ul className="setup-list">{setup.assignments.map(a => {
              const teacher = teacherById.get(a.teacherId)
              const cls = classById.get(a.classId)
              const subject = a.subjectId ? subjectById.get(a.subjectId)?.name ?? 'Subjek tidak tersedia' : 'Guru Kelas'
              return <li key={[a.teacherId, a.classId, a.subjectId].join(':')}>
                <div><strong>{teacher?.name ?? 'Guru tidak aktif'}</strong><span>{cls ? className(cls) : 'Kelas tidak tersedia'} · {subject}</span></div>
                <button type="button" className="secondary-button" disabled={disabled} onClick={() => {
                  if (window.confirm('Tarik balik tugasan ini? Akses berdasarkan tugasan ini akan dihentikan.')) {
                    void save({ action: 'revoke', ...a }, 'Tugasan berjaya ditarik balik.')
                  }
                }}>Tarik balik</button>
              </li>
            })}</ul> : <p>Belum ada tugasan guru.</p>}
          </section>
        </>
      ))}
    </div>
  )
}
