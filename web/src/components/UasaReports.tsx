import { useState } from 'react'
import { analysisGrades, type AnalysisRow } from '../../shared/analysis'
import { combineCandidates, summarizeUasa, type CandidateSummary } from '../../shared/uasa-reports'

const reports = {
  graph: 'Graf subjek',
  subject: 'Analisis subjek mengikut kelas',
  class: 'Analisis kelas mengikut subjek',
  overall: 'Analisis keseluruhan mengikut kelas',
} as const
type Report = keyof typeof reports

const number = new Intl.NumberFormat('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percent = (count: number, total: number) => total ? number.format(count / total * 100) + '%' : '—'
const point = (value: number | null) => value === null ? '—' : number.format(value)

function groupRows(rows: AnalysisRow[], key: (row: AnalysisRow) => string, label: (row: AnalysisRow) => string) {
  const groups = new Map<string, { id: string; label: string; rows: AnalysisRow[] }>()
  for (const row of rows) {
    const id = key(row)
    const existing = groups.get(id)
    if (existing) existing.rows.push(row)
    else groups.set(id, { id, label: label(row), rows: [row] })
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'ms'))
}

function CandidateTable({ candidates, labels, includeAbsent }: {
  candidates: CandidateSummary[]
  labels: Map<string, string>
  includeAbsent: boolean
}) {
  const rows = candidates.map(row => ({ ...row, label: labels.get(row.classId) ?? row.classId }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ms'))
  if (!rows.length) return <p>Tiada calon dalam kelas yang mempunyai subjek berkenaan.</p>
  const totals = combineCandidates(candidates)
  function cells(row: typeof totals) {
    const decided = row.passed + row.failed + (includeAbsent ? row.absentAll : 0)
    return <>
      <td>{row.registered}</td><td>{row.attended}</td>
      <td>{row.passed} ({percent(row.passed, decided)})</td>
      <td>{row.failed} ({percent(row.failed, decided)})</td>
      <td>{row.absentAll}{includeAbsent && ' (' + percent(row.absentAll, decided) + ')'}</td><td>{row.pending}</td>
    </>
  }
  return <div className="analysis-scroll"><table className="analysis-table">
    <caption>Status calon mengikut kelas</caption>
    <thead><tr><th scope="col">Kelas</th><th scope="col">Daftar</th><th scope="col">Hadir sekurang-kurangnya satu subjek</th>
      <th scope="col">Lulus</th><th scope="col">Tidak melepasi minimum</th><th scope="col">TH semua</th><th scope="col">Belum lengkap</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.classId}><th scope="row">{row.label}</th>{cells(row)}</tr>)}</tbody>
    <tfoot><tr><th scope="row">Jumlah kelas</th>{cells(totals)}</tr></tfoot>
  </table></div>
}

export function UasaReports({ rows, candidates }: { rows: AnalysisRow[]; candidates: CandidateSummary[] }) {
  const [view, setView] = useState<Report>('graph')
  const [level, setLevel] = useState('')
  const [chosen, setChosen] = useState('')
  const levels = [...new Set(rows.map(row => row.level))].sort()
  const scoped = level ? rows.filter(row => row.level === level) : rows
  const classes = groupRows(scoped, row => row.classId, row => row.className)
  const subjects = groupRows(scoped, row => row.subjectId, row => row.subjectName + ' (' + row.subjectCode + ')')
  const options = view === 'class' ? classes : subjects
  const selection = options.find(item => item.id === chosen) ?? options[0]
  const selected = view === 'overall' ? scoped : selection?.rows ?? []
  const summary = summarizeUasa(selected)
  const groups = view === 'class'
    ? groupRows(selected, row => row.subjectId, row => row.subjectName + ' (' + row.subjectCode + ')')
    : groupRows(selected, row => row.classId, row => row.className)
  const graph = [...analysisGrades.map(grade => ({ grade, count: summary.grades[grade] })),
    { grade: 'TH', count: summary.absent }]
  const largest = Math.max(1, ...graph.map(bar => bar.count))
  const gradePercentBase = (row: typeof summary) => view === 'overall' ? row.recorded : row.present

  function metrics(row: typeof summary) {
    return <>
      {analysisGrades.map(grade => <td key={grade}>{row.grades[grade]} ({percent(row.grades[grade], gradePercentBase(row))})</td>)}
      <td>{row.absent} ({percent(row.absent, row.recorded)})</td>
      <td>{point(row.gradePoint)}</td>
      <td>{row.passed} ({percent(row.passed, row.present)})</td>
      <td>{row.failed} ({percent(row.failed, row.present)})</td>
      <td>{row.recorded}</td><td>{row.present}</td><td>{row.pending}</td>
    </>
  }

  return <section className="uasa-reports" aria-labelledby="uasa-reports-title">
    <h3 id="uasa-reports-title">Laporan UASA</h3>
    <div className="setup-fields">
      <label>Jenis laporan<select value={view} onChange={event => {
        setView(event.target.value as Report)
        setChosen('')
      }}>{Object.entries(reports).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label>Tingkatan<select value={level} onChange={event => { setLevel(event.target.value); setChosen('') }}>
        <option value="">Semua tingkatan</option>
        {levels.map(item => <option key={item} value={item}>{item === 'PERALIHAN' ? 'Peralihan' : 'Tingkatan ' + item}</option>)}
      </select></label>
      {view !== 'overall' && <label>{view === 'class' ? 'Kelas laporan' : 'Subjek laporan'}
        <select value={selection?.id ?? ''} onChange={event => setChosen(event.target.value)}>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>}
    </div>
    <p className="analysis-note">GPMP dan GPS menggunakan wajaran A=1 hingga F=6. Peratus lulus dan gagal subjek berdasarkan rekod yang hadir. Rekod belum lengkap dipaparkan berasingan.</p>
    {view === 'graph' ? <>
      <dl className="analysis-totals">
        <div><dt>GPMP</dt><dd>{point(summary.gradePoint)}</dd></div>
        <div><dt>Lulus</dt><dd>{summary.passed}</dd></div>
        <div><dt>Gagal</dt><dd>{summary.failed}</dd></div>
        <div><dt>TH</dt><dd>{summary.absent}</dd></div>
      </dl>
      <figure className="uasa-grade-chart">
        <figcaption>Taburan gred {selection?.label}</figcaption>
        <ul>{graph.map(bar => <li key={bar.grade}>
          <span>{bar.grade}</span><span aria-hidden="true" className="uasa-grade-track">
            <span style={{ width: `${bar.count / largest * 100}%` }} />
          </span><strong>{bar.count}</strong>
        </li>)}</ul>
      </figure>
    </> : <>
      {view !== 'subject' && <p><strong>GPS {view === 'class' ? 'kelas' : 'keseluruhan'}:</strong> {point(summary.gradePoint)}</p>}
      <div className="analysis-scroll"><table className="analysis-table">
        <caption>{view === 'overall' ? 'Rekod subjek mengikut kelas' : reports[view]}</caption>
        <thead><tr>
          <th scope="col">{view === 'class' ? 'Subjek' : 'Kelas'}</th>
          {analysisGrades.map(grade => <th scope="col" key={grade}>{grade}</th>)}
          <th scope="col">TH</th><th scope="col">{view === 'overall' ? 'GPS' : 'GPMP'}</th>
          <th scope="col">Lulus subjek</th><th scope="col">Gagal subjek</th>
          <th scope="col">Rekod A–F + TH</th><th scope="col">Hadir</th><th scope="col">Belum lengkap</th>
        </tr></thead>
        <tbody>{groups.map(group => <tr key={group.id}><th scope="row">{group.label}</th>{metrics(summarizeUasa(group.rows))}</tr>)}</tbody>
        <tfoot><tr><th scope="row">Jumlah</th>{metrics(summary)}</tr></tfoot>
      </table></div>
      {view !== 'subject' && <>
        <p className="analysis-note">Status calon menggunakan semua subjek dalam skop kelas. A–E bagi semua subjek dikira lulus. Sebarang F atau TH dikira tidak melepasi minimum selepas rekod lengkap, kecuali TH semua. {view === 'class' ? 'Peratus status kelas turut mengambil kira calon TH semua.' : 'Peratus status keseluruhan menggunakan calon lulus dan gagal.'}</p>
        <CandidateTable candidates={candidates.filter(row => view === 'overall'
          ? classes.some(group => group.id === row.classId) : row.classId === selection?.id)}
          includeAbsent={view === 'class'} labels={new Map(classes.map(group => [group.id, group.label]))} />
      </>}
    </>}
  </section>
}
