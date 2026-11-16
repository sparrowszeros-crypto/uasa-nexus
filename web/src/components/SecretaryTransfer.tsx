import { useEffect, useState, type FormEvent } from 'react'
import { auth } from '../lib/firebase'
import { useAccount } from '../lib/account-context'
import './SchoolSetup.css'

interface Teacher {
  id: string
  name: string
  email: string
}

async function request(signal?: AbortSignal, teacher?: Teacher) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sila log masuk semula.')
  const response = await fetch('/api/admin/secretary-transfer', {
    method: teacher ? 'POST' : 'GET',
    signal,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: teacher ? JSON.stringify({ teacherId: teacher.id, teacherEmail: teacher.email }) : undefined,
  })
  const data = await response.json().catch(() => null) as {
    ok?: boolean
    teachers?: Teacher[]
    message?: string
  } | null
  if (!response.ok || !data?.ok) throw new Error(data?.message || 'Permintaan tidak dapat diselesaikan.')
  return data
}

export function SecretaryTransfer() {
  const { logout } = useAccount()
  const [teachers, setTeachers] = useState<Teacher[]>()
  const [chosen, setChosen] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const selected = teachers?.find(teacher => teacher.id === chosen)

  useEffect(() => {
    const controller = new AbortController()
    request(controller.signal)
      .then(result => { if (!controller.signal.aborted) setTeachers(result.teachers ?? []) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || loading || !selected) return
    if (!window.confirm(`Pindahkan jawatan Setiausaha Peperiksaan kepada ${selected.name} (${selected.email})? Peranan setiausaha anda akan ditarik balik dan anda akan dilog keluar.`)) return
    setBusy(true)
    setError('')
    try {
      await request(undefined, selected)
      await logout()
      window.alert(`Jawatan Setiausaha Peperiksaan berjaya dipindahkan kepada ${selected.name}. Minta guru tersebut log masuk semula.`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Pemindahan jawatan gagal.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="content-card">
    <h2>Pindah jawatan Setiausaha Peperiksaan</h2>
    <p>Pilih guru aktif yang sudah pernah log masuk menggunakan akaun Google yang berdaftar. Peranan guru sedia ada dikekalkan.</p>
    {error && <p role="alert" className="setup-error">{error}</p>}
    {loading && <p role="status">Memuatkan senarai guru…</p>}
    {!loading && teachers?.length === 0 && <p>Tiada guru yang layak. Minta guru penerima log masuk dahulu.</p>}
    <form onSubmit={submit}>
      <fieldset className="setup-fields" disabled={busy || loading}>
        <label>Guru penerima<select required value={selected?.id ?? ''} disabled={!teachers?.length}
          onChange={event => setChosen(event.target.value)}>
          <option value="">Pilih guru</option>
          {teachers?.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.email})</option>)}
        </select></label>
        <button className="secondary-button" type="submit" disabled={!selected}>{busy ? 'Sedang dipindahkan…' : 'Pindah jawatan'}</button>
        <button className="secondary-button" type="button" onClick={() => {
          setChosen('')
          setError('')
          setLoading(true)
          setRefresh(value => value + 1)
        }}>Muat semula senarai</button>
      </fieldset>
    </form>
  </section>
}
