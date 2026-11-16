import { useRef, useState, type FormEvent } from 'react'
import { parseRosterCsv, rosterCsvHeader, rosterCsvMaxBytes } from '../../shared/roster-csv'
import type { RosterClass } from '../../shared/roster'

const template = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + rosterCsvHeader + '\r\n')

export function RosterCsvImport({ cls, startDefault, disabled, onImport }: {
  cls: RosterClass
  startDefault: string
  disabled: boolean
  onImport: (csv: string, date: string) => Promise<boolean>
}) {
  const [preview, setPreview] = useState<{ csv: string; pupils: ReturnType<typeof parseRosterCsv> }>()
  const [error, setError] = useState('')
  const request = useRef(0)

  async function previewFile(file?: File) {
    const id = ++request.current
    setError('')
    setPreview(undefined)
    if (!file) return
    try {
      if (file.size > rosterCsvMaxBytes) throw new Error('Fail CSV melebihi 256 KB.')
      let csv: string
      try { csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
      catch { throw new Error('Simpan fail dalam format CSV UTF-8.') }
      const pupils = parseRosterCsv(csv)
      if (id === request.current) setPreview({ csv, pupils })
    } catch (error) {
      if (id === request.current) setError(error instanceof Error ? error.message : 'Fail tidak dapat dibaca.')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!preview || disabled) return
    const form = event.currentTarget
    const date = String(new FormData(form).get('startDate') ?? '')
    if (await onImport(preview.csv, date)) {
      form.reset()
      setPreview(undefined)
    }
  }

  return <details>
    <summary>Daftar murid secara pukal (CSV)</summary>
    <p><a href={template} download="templat-murid.csv">Muat turun templat CSV</a>. Isi satu murid setiap baris, kemudian simpan sebagai CSV UTF-8.</p>
    <p>Lajur: <code>{rosterCsvHeader}</code>. Nombor daftar ialah teks supaya sifar di hadapan dikekalkan. Had 800 murid dan 256 KB setiap fail.</p>
    <form onSubmit={submit}>
      <fieldset className="setup-fields" disabled={disabled}>
        <label>Fail CSV<input type="file" accept=".csv,text/csv" required onChange={event => void previewFile(event.target.files?.[0])} /></label>
        <label>Tarikh mula untuk semua murid<input type="date" name="startDate" required defaultValue={startDefault}
          min={cls.year + '-01-01'} max={cls.year + '-12-31'} /></label>
        <button type="submit" className="secondary-button" disabled={!preview}>{preview ? 'Daftar ' + preview.pupils.length + ' murid' : 'Daftar murid'}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className="setup-error">{error}</p>}
    {preview && <>
      <p role="status">Pratonton {Math.min(preview.pupils.length, 5)} daripada {preview.pupils.length} murid untuk {cls.name} ({cls.year}).</p>
      <ul>{preview.pupils.slice(0, 5).map(pupil => <li key={pupil.number}>{pupil.number} · {pupil.name}</li>)}</ul>
    </>}
  </details>
}
