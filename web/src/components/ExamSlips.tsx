import { useEffect, useState } from 'react'
import { auth } from '../lib/firebase'
import type { ExamSlip, SlipClass, SlipPupil } from '../../shared/slips'
import './SchoolSetup.css'
import './ExamSlips.css'

interface SlipResponse {
  options?: SlipClass[]
  pupils?: SlipPupil[]
  slip?: ExamSlip
  slips?: ExamSlip[]
  message?: string
}

function useSlipData(path: string | null) {
  const [result, setResult] = useState<{ path: string; data?: SlipResponse; error?: string }>()
  useEffect(() => {
    if (path === null) return
    const controller = new AbortController()
    async function load() {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error('Sila log masuk semula.')
        const response = await fetch('/api/staff/slips' + path, {
          signal: controller.signal, headers: { Authorization: 'Bearer ' + token },
        })
        const data = await response.json() as SlipResponse
        if (!response.ok) throw new Error(data.message || 'Slip belum dapat dimuatkan.')
        if (!controller.signal.aborted && path !== null) setResult({ path, data })
      } catch (error) {
        if (!controller.signal.aborted && path !== null) setResult({
          path, error: error instanceof Error ? error.message : 'Slip belum dapat dimuatkan.',
        })
      }
    }
    void load()
    return () => controller.abort()
  }, [path])
  return result?.path === path ? result : undefined
}

const optionKey = (option: SlipClass) => option.examId + ':' + option.classId

export function ExamSlips({ allowBulk = false }: { allowBulk?: boolean }) {
  const [mode, setMode] = useState<'individual' | 'bulk'>('individual')
  const [selection, setSelection] = useState('')
  const [pupilId, setPupilId] = useState('')
  const options = useSlipData('')
  const chosen = options?.data?.options?.find(o => optionKey(o) === selection)
  const query = chosen ? '?' + new URLSearchParams({ examId: chosen.examId, classId: chosen.classId }) : null
  const bulk = allowBulk && mode === 'bulk'
  const pupils = useSlipData(bulk ? null : query)
  const record = useSlipData(query && bulk ? query + '&mode=bulk' : query && pupilId ? query + '&studentId=' + encodeURIComponent(pupilId) : null)
  const individual = record?.data?.slip
  const slips = bulk ? record?.data?.slips ?? [] : individual ? [individual] : []
  const error = options?.error || pupils?.error || record?.error

  return (
    <section className="content-card">
      <h2>Cetak slip peperiksaan</h2>
      {error && <p role="alert" className="setup-error">{error}</p>}
      {!options && <p role="status">Memuatkan peperiksaan yang diterbitkan…</p>}
      {options?.data?.options?.length === 0 && <p>Tiada keputusan diterbitkan untuk kelas yang boleh anda akses.</p>}
      {!!options?.data?.options?.length && (
        <div className="setup-fields">
          {allowBulk && <label>Kaedah cetak<select value={mode} onChange={event => {
            setMode(event.target.value === 'bulk' ? 'bulk' : 'individual')
            setPupilId('')
          }}>
            <option value="individual">Individu</option>
            <option value="bulk">Pukal satu kelas</option>
          </select></label>}
          <label>Peperiksaan dan kelas
            <select value={selection} onChange={event => {
              setSelection(event.target.value)
              setPupilId('')
            }}>
              <option value="">Pilih peperiksaan dan kelas</option>
              {options.data.options.map(o => <option key={optionKey(o)} value={optionKey(o)}>
                {o.examName} · {o.className} ({o.year})
              </option>)}
            </select>
          </label>
          {chosen && !bulk && <label>Murid
            <select value={pupilId} onChange={event => setPupilId(event.target.value)} disabled={!pupils?.data?.pupils?.length}>
              <option value="">{pupils ? 'Pilih murid' : 'Memuatkan murid…'}</option>
              {pupils?.data?.pupils?.map(p => <option key={p.id} value={p.id}>{p.name} ({p.number})</option>)}
            </select>
          </label>}
          {slips.length > 0 && <button type="button" className="secondary-button" onClick={() => window.print()}>{bulk ? `Cetak ${slips.length} slip` : 'Cetak slip'}</button>}
        </div>
      )}
      {pupils?.data?.pupils?.length === 0 && <p>Tiada murid dengan markah atau rekod TH dalam kelas ini.</p>}
      {(pupilId || (chosen && bulk)) && !record && <p role="status">Memuatkan slip…</p>}
      {bulk && record?.data?.slips?.length === 0 && <p>Tiada slip untuk kelas ini.</p>}
      {chosen && slips.length > 0 && <div id="uasa-slip">{slips.map(slip => <article key={slip.pupil.id} className="exam-slip">
        <h2>Slip Keputusan Peperiksaan</h2>
        <p>{chosen.examName} · Sesi {chosen.year}</p>
        <dl>
          <dt>Nama murid</dt><dd>{slip.pupil.name}</dd>
          <dt>No. daftar</dt><dd>{slip.pupil.number}</dd>
          <dt>Kelas</dt><dd>{chosen.className}</dd>
        </dl>
        <table>
          <thead><tr><th scope="col">Subjek</th><th scope="col">Markah</th><th scope="col">Gred</th></tr></thead>
          <tbody>{slip.subjects.map(item => <tr key={item.id}>
            <th scope="row">{item.name} ({item.code})</th>
            <td>{item.attendance === 'absent' ? 'TH' : item.mark ?? '—'}</td>
            <td>{item.grade}</td>
          </tr>)}</tbody>
        </table>
        <p>TH = Tidak hadir. — = Markah belum direkodkan.</p>
      </article>)}</div>}
    </section>
  )
}
