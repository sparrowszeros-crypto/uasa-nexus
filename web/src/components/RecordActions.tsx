import { useState, type FormEvent } from 'react'
import { levels, teacherRoles, type TeacherRole } from '../../shared/setup'
import { auth } from '../lib/firebase'

type RecordItem =
  | { entity: 'exam'; id: string; name: string; marksDeadline: string | null }
  | { entity: 'class'; id: string; name: string; level: string }
  | { entity: 'subject'; id: string; name: string; code: string }
  | { entity: 'student'; id: string; name: string; number: string }
  | { entity: 'teacher'; id: string; name: string; email: string; roles: TeacherRole[] }

const labels = { exam: 'peperiksaan', class: 'kelas', subject: 'subjek', student: 'murid', teacher: 'guru' }
const roleLabels = { class_teacher: 'Guru Kelas', subject_teacher: 'Guru Subjek' }

function malaysiaDeadline(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value)).replace(' ', 'T')
}

export function RecordActions({ item, onChanged, disabled = false }: {
  item: RecordItem
  onChanged: () => void | Promise<void>
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string }>()
  const kind = labels[item.entity]
  const blocked = busy || disabled

  async function save(action: 'edit' | 'delete', data?: FormData) {
    if (blocked) return
    setBusy(true)
    setNotice(undefined)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Sila log masuk semula.')
      const fields = data ? Object.fromEntries(data) : {}
      const response = await fetch('/api/admin/manage-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ ...fields, action, entity: item.entity, id: item.id, roles: data?.getAll('role') }),
      })
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null
      if (!response.ok || !result?.ok) throw new Error(result?.message || 'Perubahan tidak dapat disimpan.')
      setEditing(false)
      setNotice({ ok: true, text: 'Perubahan disimpan.' })
      await onChanged()
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : 'Perubahan tidak dapat disimpan.' })
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void save('edit', new FormData(event.currentTarget))
  }

  return <div className="record-actions">
    {notice && <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'setup-success' : 'setup-error'}>{notice.text}</p>}
    {editing ? (
      <form onSubmit={submit}>
        <fieldset className="setup-fields" disabled={blocked}>
          <legend>Edit {kind}</legend>
          <label>Nama<input name="name" defaultValue={item.name} required maxLength={
            { exam: 100, class: 80, subject: 100, student: 150, teacher: 120 }[item.entity]
          } /></label>
          {item.entity === 'exam' && <label>Tarikh akhir markah (waktu Malaysia)
            <input type="datetime-local" name="deadline" defaultValue={malaysiaDeadline(item.marksDeadline)} />
          </label>}
          {item.entity === 'class' && <label>Tahap<select name="level" defaultValue={item.level}>
            {levels.map(level => <option key={level} value={level}>{level === 'PERALIHAN' ? 'Peralihan' : 'Tingkatan ' + level}</option>)}
          </select></label>}
          {item.entity === 'subject' && <label>Kod subjek<input name="code" defaultValue={item.code} required maxLength={16} /></label>}
          {item.entity === 'student' && <label>Nombor daftar<input name="number" defaultValue={item.number} required maxLength={30} /></label>}
          {item.entity === 'teacher' && <>
            <label>E-mel Google atau DELIMa<input name="email" type="email" defaultValue={item.email} required maxLength={254} /></label>
            <div className="setup-roles">{teacherRoles.map(role => <label key={role}>
              <input name="role" type="checkbox" value={role} defaultChecked={item.roles.includes(role)} />{roleLabels[role]}
            </label>)}</div>
          </>}
          <button className="secondary-button" type="submit">Simpan perubahan</button>
          <button className="secondary-button" type="button" onClick={() => setEditing(false)}>Batal</button>
        </fieldset>
      </form>
    ) : <div className="record-buttons">
      <button className="secondary-button" type="button" disabled={blocked} aria-label={'Edit ' + item.name}
        onClick={() => { setEditing(true); setNotice(undefined) }}>Edit</button>
      <button className="secondary-button" type="button" disabled={blocked} aria-label={'Padam ' + item.name} onClick={() => {
        const message = item.entity === 'teacher'
          ? 'Nyahaktifkan ' + item.name + ' dan tarik balik semua tugasannya?'
          : 'Padam ' + kind + ' “' + item.name + '”?'
        if (window.confirm(message)) void save('delete')
      }}>Padam</button>
    </div>}
  </div>
}
