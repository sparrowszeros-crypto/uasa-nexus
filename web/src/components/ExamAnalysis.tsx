import { useEffect, useState } from 'react'
import { auth } from '../lib/firebase'
import { analysisGrades, type AnalysisExam, type AnalysisRow, type PendingPupil } from '../../shared/analysis'
import type { CandidateSummary } from '../../shared/uasa-reports'
import { UasaReports } from './UasaReports'
import './SchoolSetup.css'
import './ExamAnalysis.css'

interface AnalysisResponse {
  exams?: AnalysisExam[]
  rows?: AnalysisRow[]
  pupils?: PendingPupil[]
  candidates?: CandidateSummary[]
  message?: string
}

function useAnalysis(query: string | null, refresh: number) {
  const [result, setResult] = useState<{
    query: string
    refresh: number
    data?: AnalysisResponse
    error?: string
  }>()
  useEffect(() => {
    if (query === null) return
    const controller = new AbortController()
    async function load(path: string) {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error('Sila log masuk semula.')
        const response = await fetch('/api/admin/exam-analysis' + path, {
          signal: controller.signal,
          headers: { Authorization: 'Bearer ' + token },
        })
        const data = await response.json().catch(() => null) as AnalysisResponse | null
        if (!response.ok || !data) throw new Error(data?.message ?? 'Analisis belum dapat dimuatkan.')
        if (!controller.signal.aborted) setResult({ query: path, refresh, data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({
          query: path, refresh, error: error instanceof Error ? error.message : 'Analisis belum dapat dimuatkan.',
        })
      }
    }
    void load(query)
    return () => controller.abort()
  }, [query, refresh])
  return result?.query === query && result.refresh === refresh ? result : undefined
}

const format = new Intl.NumberFormat('ms-MY', { maximumFractionDigits: 2 })
const average = (sum: number, count: number) => count ? format.format(sum / count) : '—'
const label = { draft: 'Draf', submitted: 'Kemasukan dibuka', verified: 'Disahkan', published: 'Diterbitkan' }

export function ExamAnalysis() {
  const [examId, setExamId] = useState('')
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [detail, setDetail] = useState<AnalysisRow>()
  const [refresh, setRefresh] = useState(0)
  const examList = useAnalysis('', refresh)
  const exams = examList?.data?.exams ?? []
  const exam = exams.find(item => item.id === examId) ?? exams[0]
  const query = exam ? '?' + new URLSearchParams({ examId: exam.id }) : null
  const report = useAnalysis(query, refresh)
  const missing = useAnalysis(query && detail ? query + '&' + new URLSearchParams({
    classId: detail.classId, subjectId: detail.subjectId,
  }) : null, refresh)
  const rows = report?.data?.rows ?? []
  const classes = new Map(rows.map(row => [row.classId, row.className]))
  const subjects = new Map(rows.map(row => [row.subjectId, row.subjectName + ' (' + row.subjectCode + ')']))
  const filtered = rows.filter(row => (!classId || row.classId === classId) && (!subjectId || row.subjectId === subjectId))
  const visible = pendingOnly ? filtered.filter(row => row.pending > 0) : filtered
  const totals = filtered.reduce((total, row) => ({
    expected: total.expected + row.expected,
    present: total.present + row.present,
    absent: total.absent + row.absent,
    pending: total.pending + row.pending,
    markTotal: total.markTotal + row.markTotal,
  }), { expected: 0, present: 0, absent: 0, pending: 0, markTotal: 0 })
  const error = examList?.error ?? report?.error

  return (
    <section className="content-card">
      <h2>Analisis peperiksaan</h2>
      {error && <p className="setup-error" role="alert">{error}</p>}
      <div className="setup-fields">
        <label>Peperiksaan
          <select value={exam?.id ?? ''} disabled={!exams.length} onChange={e => {
            setExamId(e.target.value)
            setClassId('')
            setSubjectId('')
            setDetail(undefined)
          }}>
            {!exams.length && <option value="">{examList ? 'Tiada pilihan' : 'Memuatkan peperiksaan…'}</option>}
            {exams.map(item => <option key={item.id} value={item.id}>{item.name} ({item.year}) · {label[item.status]}</option>)}
          </select>
        </label>
        <label>Kelas
          <select value={classId} onChange={e => { setClassId(e.target.value); setDetail(undefined) }} disabled={!rows.length}>
            <option value="">Semua kelas</option>
            {[...classes].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>Subjek
          <select value={subjectId} onChange={e => { setSubjectId(e.target.value); setDetail(undefined) }} disabled={!rows.length}>
            <option value="">Semua subjek</option>
            {[...subjects].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={() => setRefresh(value => value + 1)}>Muat semula</button>
      </div>
      {examList?.data && !exams.length && <p>Daftar peperiksaan dahulu untuk melihat analisis.</p>}
      {exam && !report && <p role="status">Memuatkan analisis…</p>}
      {report?.data && (
        <>
          <p className="analysis-note">
            Analisis merangkumi subjek yang ditugaskan kepada guru atau mempunyai rekod peperiksaan.
            Kiraan ialah bilangan rekod murid-subjek. Purata menggunakan markah murid hadir, termasuk markah 0.
          </p>
          {exam?.status === 'published' && <p className="analysis-note">
            Semakan menggunakan senarai murid semasa dan rekod terbitan yang sudah disimpan.
          </p>}
          <dl className="analysis-totals">
            <div><dt>Rekod dijangka</dt><dd>{totals.expected}</dd></div>
            <div><dt>Markah diisi</dt><dd>{totals.present}</dd></div>
            <div><dt>TH</dt><dd>{totals.absent}</dd></div>
            <div><dt>Belum lengkap</dt><dd>{totals.pending}</dd></div>
            <div><dt>Purata markah</dt><dd>{average(totals.markTotal, totals.present)}</dd></div>
          </dl>
          {rows.length > 0 && <label className="analysis-toggle">
            <input type="checkbox" checked={pendingOnly} onChange={e => {
              setPendingOnly(e.target.checked)
              setDetail(undefined)
            }} />
            Paparkan yang belum lengkap sahaja
          </label>}
          {!rows.length && <p>Belum ada penugasan kelas dan subjek untuk sesi peperiksaan ini.</p>}
          {!!rows.length && !visible.length && <p>Tiada rekod yang sepadan dengan tapisan.</p>}
          {!!visible.length && <div className="analysis-scroll">
            <table className="analysis-table">
              <caption>Markah dan taburan gred mengikut kelas dan subjek</caption>
              <thead><tr>
                <th scope="col">Kelas</th><th scope="col">Subjek</th><th scope="col">Dijangka</th>
                <th scope="col">Diisi</th><th scope="col">TH</th><th scope="col">Belum lengkap</th><th scope="col">Purata</th>
                {analysisGrades.map(grade => <th key={grade} scope="col">{grade}</th>)}
              </tr></thead>
              <tbody>{visible.map(row => <tr key={row.classId + ':' + row.subjectId}>
                <td>{row.className}</td><th scope="row">{row.subjectName} ({row.subjectCode})</th>
                <td>{row.expected}</td><td>{row.present}</td><td>{row.absent}</td>
                <td>{row.pending ? <button type="button" className="analysis-detail" onClick={() => setDetail(row)}
                  aria-label={`Lihat ${row.pending} rekod belum lengkap, ${row.className}, ${row.subjectName}`}>{row.pending}</button> : 0}</td>
                <td>{average(row.markTotal, row.present)}</td>
                {analysisGrades.map(grade => <td key={grade}>{row.grades[grade]}</td>)}
              </tr>)}</tbody>
            </table>
          </div>}
          {!!rows.length && <UasaReports key={exam?.id} rows={rows} candidates={report.data.candidates ?? []} />}
          {detail && <section className="analysis-pending" aria-labelledby="analysis-pending-title">
            <h3 id="analysis-pending-title">Belum lengkap · {detail.className} · {detail.subjectName}</h3>
            <button type="button" className="secondary-button" onClick={() => setDetail(undefined)}>Tutup senarai</button>
            {!missing && <p role="status">Memuatkan senarai murid…</p>}
            {missing?.error && <p role="alert">{missing.error}</p>}
            {missing?.data?.pupils?.length === 0 && <p>Tiada rekod belum lengkap.</p>}
            {!!missing?.data?.pupils?.length && <ul className="setup-list">
              {missing.data.pupils.map(pupil => <li key={pupil.id}><strong>{pupil.name}</strong><span>{pupil.number}</span></li>)}
            </ul>}
          </section>}
        </>
      )}
    </section>
  )
}
