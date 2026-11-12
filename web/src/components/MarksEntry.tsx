import { useEffect, useState, useMemo } from 'react'
import { auth } from '../lib/firebase'
import { calculateGrade, type Exam, type ExamSubjectResultData, type StudentResultEntry } from '../../shared/exams'
import './SchoolSetup.css'

interface Scope {
  schoolWide: boolean
  classes: { id: string; name: string; year: number }[]
  subjectAssignments: {
    classId: string
    className: string
    year: number
    subjectId: string
    subjectName: string
  }[]
}

interface LocalEntry {
  studentId: string
  studentName: string
  studentNumber: string
  mark: number | null
  attendance: 'present' | 'absent' | 'pending'
}

export function MarksEntry({ email }: { email?: string }) {
  void email
  const [exams, setExams] = useState<Exam[]>([])
  const [scope, setScope] = useState<Scope>()
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string; code: string }[]>([])
  const [allClasses, setAllClasses] = useState<{ id: string; name: string; year: number }[]>([])

  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')

  const [resultData, setResultData] = useState<ExamSubjectResultData | null>(null)
  const [entries, setEntries] = useState<LocalEntry[]>([])

  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [saving, setSaving] = useState(false)
  const year = exams.find(exam => exam.id === selectedExamId)?.year
  const classesForYear = allClasses.filter(c => c.year === year)
  const assignmentsForYear = scope?.subjectAssignments.filter(a => a.year === year) ?? []
  const selectionMatches = resultData?.examId === selectedExamId && resultData.classId === selectedClassId
    && resultData.subjectId === selectedSubjectId
  const original = useMemo(() => new Map<string, StudentResultEntry>(resultData?.results.map(r => [r.studentId, r])), [resultData])
  const changes = entries.filter(e => {
    const row = original.get(e.studentId)
    return row && (row.mark !== e.mark || row.attendance !== e.attendance)
  })
  const [notice, setNotice] = useState<{ ok: boolean; text: string }>()

  // 1. Muatkan peperiksaan dan skop guru
  useEffect(() => {
    const controller = new AbortController()
    async function loadInit() {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error('Sesi telah tamat.')
        const [resExams, resScope] = await Promise.all([
          fetch('/api/staff/exams', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }),
          fetch('/api/staff/scope', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }),
        ])

        const dataExams = (await resExams.json()) as { exams?: Exam[] }
        const dataScope = (await resScope.json()) as { scope?: Scope }

        if (!resExams.ok || !resScope.ok || !dataExams.exams || !dataScope.scope) throw new Error()
        const initialYear = dataExams.exams[0]?.year
        if (dataExams.exams) {
          setExams(dataExams.exams)
          if (dataExams.exams.length > 0) {
            setSelectedExamId(dataExams.exams[0].id)
          }
        }

        if (dataScope.scope) {
          setScope(dataScope.scope)
          if (dataScope.scope.schoolWide) {
            // Setiausaha: muatkan semua kelas & subjek dari setup
            const resSetup = await fetch('/api/admin/school-setup', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
            const dataSetup = (await resSetup.json()) as { setup?: { classes: Scope['classes']; subjects: { id: string; name: string; code: string; active: boolean }[] } }
            if (!resSetup.ok || !dataSetup.setup) throw new Error()
            if (dataSetup.setup) {
              setAllClasses(dataSetup.setup.classes || [])
              const activeSubjects = dataSetup.setup.subjects.filter(s => s.active)
              setAllSubjects(activeSubjects)
              setSelectedClassId(dataSetup.setup.classes.find(c => c.year === initialYear)?.id ?? '')
              setSelectedSubjectId(activeSubjects[0]?.id ?? '')
            }
          } else if (dataScope.scope.subjectAssignments.length > 0) {
            // Guru Subjek: pilih penugasan pertama
            const first = dataScope.scope.subjectAssignments.find(a => a.year === initialYear)
            if (!first) return
            setSelectedClassId(first.classId)
            setSelectedSubjectId(first.subjectId)
          }
        }
      } catch {
        if (!controller.signal.aborted) setNotice({ ok: false, text: 'Gagal memuatkan data awal peperiksaan.' })
      } finally {
        if (!controller.signal.aborted) setLoadingInitial(false)
      }
    }

    void loadInit()
    return () => controller.abort()
  }, [])

  // 2. Muatkan senarai murid & markah apabila pilihan berubah
  useEffect(() => {
    const controller = new AbortController()

    async function fetchResults() {
      if (!selectedExamId || !selectedClassId || !selectedSubjectId) {
        return
      }

      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error('Sesi telah tamat.')
        if (controller.signal.aborted) return
        setLoadingResults(true)
        setNotice(undefined)
        const url = `/api/staff/results?examId=${encodeURIComponent(selectedExamId)}&classId=${encodeURIComponent(selectedClassId)}&subjectId=${encodeURIComponent(selectedSubjectId)}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
        const data = (await res.json()) as { ok: boolean; data?: ExamSubjectResultData; message?: string }
        if (controller.signal.aborted) return

        if (res.ok && data.data) {
          setResultData(data.data)
          setEntries(
            data.data.results.map((r) => ({
              studentId: r.studentId,
              studentName: r.studentName,
              studentNumber: r.studentNumber,
              mark: r.mark,
              attendance: r.attendance,
            })),
          )
        } else {
          setResultData(null)
          setEntries([])
          setNotice({ ok: false, text: data.message || 'Gagal memuatkan senarai markah.' })
        }
      } catch {
        if (!controller.signal.aborted) {
          setResultData(null)
          setEntries([])
          setNotice({ ok: false, text: 'Ralat sambungan pelayan.' })
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingResults(false)
        }
      }
    }

    void fetchResults()

    return () => controller.abort()
  }, [selectedExamId, selectedClassId, selectedSubjectId])

  function changeSelection() {
    if (selectionMatches && changes.length && !window.confirm('Buang perubahan markah yang belum disimpan?')) return false
    setResultData(null)
    setEntries([])
    setNotice(undefined)
    setLoadingResults(false)
    return true
  }

  // Tukar markah murid
  function handleMarkChange(index: number, valStr: string) {
    setEntries((prev) => {
      const copy = [...prev]
      if (valStr === '') {
        copy[index] = { ...copy[index], mark: null, attendance: 'pending' }
      } else {
        const num = parseFloat(valStr)
        if (!isNaN(num)) {
          const clamped = Math.round(Math.min(100, Math.max(0, num)) * 100) / 100
          copy[index] = { ...copy[index], mark: clamped, attendance: 'present' }
        }
      }
      return copy
    })
  }

  // Tukar status kehadiran (Hadir / TH)
  function handleAttendanceChange(index: number, att: 'present' | 'absent') {
    setEntries((prev) => {
      const copy = [...prev]
      if (att === 'absent') {
        copy[index] = { ...copy[index], attendance: 'absent', mark: null }
      } else {
        copy[index] = { ...copy[index], attendance: copy[index].mark === null ? 'pending' : 'present' }
      }
      return copy
    })
  }

  // 3. Simpan markah ke pelayan
  async function handleSave() {
    if (saving || !selectionMatches || !changes.length || isReadOnly) return

    setSaving(true)
    setNotice(undefined)

    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('Sesi telah tamat.')
      const res = await fetch('/api/staff/results', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          examId: selectedExamId,
          classId: selectedClassId,
          subjectId: selectedSubjectId,
          entries: changes.map((e) => ({
            studentId: e.studentId,
            mark: e.mark,
            attendance: e.attendance,
          })),
        }),
      })

      const data = (await res.json()) as { ok: boolean; message?: string }
      if (res.ok && data.ok) {
        setResultData(current => current && ({ ...current, results: entries.map(entry => ({
          ...entry, grade: calculateGrade(entry.mark, entry.attendance),
        })) }))
        setNotice({ ok: true, text: 'Markah berjaya disimpan ke pangkalan data.' })
      } else {
        setNotice({ ok: false, text: data.message || 'Gagal menyimpan markah.' })
      }
    } catch {
      setNotice({ ok: false, text: 'Ralat sambungan pelayan semasa menyimpan markah.' })
    } finally {
      setSaving(false)
    }
  }

  // Statistik secara langsung
  const stats = useMemo(() => {
    let presentCount = 0
    let absentCount = 0
    let totalMarks = 0
    const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, TH: 0 }

    for (const e of entries) {
      if (e.attendance === 'absent') {
        absentCount++
        gradeCounts.TH++
      } else if (e.attendance === 'present' && e.mark !== null) {
        presentCount++
        totalMarks += e.mark
        const g = calculateGrade(e.mark, 'present')
        if (gradeCounts[g] !== undefined) gradeCounts[g]++
      }
    }

    const average = presentCount > 0 ? (totalMarks / presentCount).toFixed(1) : '—'
    return { total: entries.length, presentCount, absentCount, average, gradeCounts }
  }, [entries])

  const isReadOnly = resultData?.examStatus !== 'submitted'

  return (
    <div className="setup-panel">
      {notice && (
        <p className={notice.ok ? 'setup-success' : 'setup-error'} role={notice.ok ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}

      <section className="content-card">
        <h2>Kemasukan Markah Peperiksaan</h2>
        <p>Pilih peperiksaan, kelas dan mata pelajaran untuk memasukkan markah murid.</p>

        {loadingInitial ? (
          <p role="status">Memuatkan penetapan penugasan…</p>
        ) : (
          <div className="setup-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <label>
              Peperiksaan
              <select
                value={selectedExamId}
                onChange={(e) => {
                  if (!changeSelection()) return
                  const exam = exams.find(item => item.id === e.target.value)
                  const assignment = scope?.subjectAssignments.find(a => a.year === exam?.year)
                  setSelectedExamId(e.target.value)
                  setSelectedClassId(scope?.schoolWide ? allClasses.find(c => c.year === exam?.year)?.id ?? '' : assignment?.classId ?? '')
                  if (!scope?.schoolWide) setSelectedSubjectId(assignment?.subjectId ?? '')
                }}
                disabled={saving || exams.length === 0}
              >
                {exams.length === 0 && <option value="">Tiada peperiksaan dibuka</option>}
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({ex.year}) — {ex.status === 'published' ? 'Diterbitkan' : ex.status === 'submitted' ? 'Dibuka' : 'Ditutup'}
                  </option>
                ))}
              </select>
            </label>

            {scope?.schoolWide ? (
              <>
                <label>
                  Kelas (Pentadbir)
                  <select
                    value={selectedClassId}
                    disabled={saving || !classesForYear.length}
                    onChange={(e) => { if (changeSelection()) setSelectedClassId(e.target.value) }}
                  >
                    {!classesForYear.length && <option value="">Tiada kelas untuk sesi ini</option>}
                    {classesForYear.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.year}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Subjek (Pentadbir)
                  <select
                    value={selectedSubjectId}
                    disabled={saving || !allSubjects.length}
                    onChange={(e) => { if (changeSelection()) setSelectedSubjectId(e.target.value) }}
                  >
                    {!allSubjects.length && <option value="">Tiada subjek aktif</option>}
                    {allSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label style={{ gridColumn: 'span 2' }}>
                Tugasan Kelas & Subjek Anda
                <select
                  value={selectedClassId && selectedSubjectId ? `${selectedClassId}:::${selectedSubjectId}` : ''}
                  onChange={(e) => {
                    if (!changeSelection()) return
                    const [cId, sId] = e.target.value.split(':::')
                    setSelectedClassId(cId)
                    setSelectedSubjectId(sId)
                  }}
                  disabled={saving || !assignmentsForYear.length}
                >
                  {!assignmentsForYear.length && <option value="">Tiada penugasan untuk sesi ini</option>}
                  {assignmentsForYear.map((a) => (
                    <option key={`${a.classId}:::${a.subjectId}`} value={`${a.classId}:::${a.subjectId}`}>
                      {a.className} · {a.subjectName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </section>

      {selectedExamId && selectedClassId && selectedSubjectId && (
        <section className="content-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0 }}>
                {resultData ? `${resultData.className} · ${resultData.subjectName} (${resultData.subjectCode})` : 'Senarai Markah'}
              </h3>
              {selectionMatches && isReadOnly && (
                <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
                  Kemasukan markah ditutup untuk peperiksaan ini.
                </span>
              )}
            </div>

            {selectionMatches && !isReadOnly && entries.length > 0 && (
              <button
                type="button"
                className="secondary-button"
                style={{ backgroundColor: '#18564c', color: 'white', borderColor: '#18564c' }}
                disabled={saving || !changes.length}
                onClick={() => void handleSave()}
              >
                {saving ? 'Menyimpan…' : 'Simpan Markah'}
              </button>
            )}
          </div>

          {/* Ringkasan Statistik */}
          {selectionMatches && entries.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px',
                padding: '12px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              <div><strong>Jumlah Murid:</strong> {stats.total}</div>
              <div><strong>Hadir:</strong> {stats.presentCount}</div>
              <div><strong>Tidak Hadir (TH):</strong> {stats.absentCount}</div>
              <div><strong>Purata:</strong> {stats.average}</div>
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #cbd5e1', paddingTop: '6px' }}>
                <strong>Taburan Gred: </strong>
                {['A', 'B', 'C', 'D', 'E', 'F', 'TH'].map((g) => (
                  <span key={g} style={{ marginRight: '12px' }}>
                    <strong>{g}:</strong> {stats.gradeCounts[g] || 0}
                  </span>
                ))}
              </div>
            </div>
          )}

          {loadingResults || (!selectionMatches && !notice) ? (
            <p role="status">Memuatkan senarai murid dan markah…</p>
          ) : !selectionMatches ? null : entries.length === 0 ? (
            <p>Tiada murid aktif didaftarkan dalam kelas ini.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '10px 8px', width: '40px' }}>Bil</th>
                    <th style={{ padding: '10px 8px', width: '120px' }}>No. Daftar</th>
                    <th style={{ padding: '10px 8px' }}>Nama Murid</th>
                    <th style={{ padding: '10px 8px', width: '130px' }}>Kehadiran</th>
                    <th style={{ padding: '10px 8px', width: '110px' }}>Markah (0-100)</th>
                    <th style={{ padding: '10px 8px', width: '70px', textAlign: 'center' }}>Gred</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) => {
                    const grade = calculateGrade(entry.mark, entry.attendance)
                    const isAbsent = entry.attendance === 'absent'

                    return (
                      <tr
                        key={entry.studentId}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          backgroundColor: isAbsent ? '#fef2f2' : idx % 2 === 0 ? '#fff' : '#f8fafc',
                        }}
                      >
                        <td style={{ padding: '10px 8px' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 8px', color: '#64748b' }}>{entry.studentNumber}</td>
                        <td style={{ padding: '10px 8px', fontWeight: 500 }}>{entry.studentName}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <select
                            value={entry.attendance}
                            disabled={isReadOnly || saving}
                            onChange={(e) => handleAttendanceChange(idx, e.target.value as 'present' | 'absent')}
                            style={{ padding: '4px 6px', fontSize: '13px', borderRadius: '4px' }}
                          >
                            <option value="pending" disabled>Belum diisi</option>
                            <option value="present">Hadir</option>
                            <option value="absent">TH</option>
                          </select>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            disabled={isReadOnly || isAbsent || saving}
                            placeholder={isAbsent ? 'TH' : '—'}
                            value={entry.mark !== null && entry.mark !== undefined ? entry.mark : ''}
                            onChange={(e) => handleMarkChange(idx, e.target.value)}
                            style={{
                              width: '80px',
                              padding: '5px 8px',
                              fontSize: '14px',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e1',
                              fontWeight: 600,
                              textAlign: 'center',
                              backgroundColor: isAbsent ? '#f1f5f9' : '#fff',
                            }}
                          />
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              fontSize: '13px',
                              backgroundColor:
                                grade === 'A'
                                  ? '#dcfce7'
                                  : grade === 'B'
                                    ? '#e0f2fe'
                                    : grade === 'C'
                                      ? '#fef9c3'
                                      : grade === 'D'
                                        ? '#ffedd5'
                                        : grade === 'E'
                                          ? '#fee2e2'
                                          : grade === 'F'
                                            ? '#fecaca'
                                            : '#f1f5f9',
                              color:
                                grade === 'A'
                                  ? '#15803d'
                                  : grade === 'B'
                                    ? '#0369a1'
                                    : grade === 'C'
                                      ? '#854d0e'
                                      : grade === 'D'
                                        ? '#c2410c'
                                        : grade === 'E'
                                          ? '#b91c1c'
                                          : grade === 'F'
                                            ? '#991b1b'
                                            : '#64748b',
                            }}
                          >
                            {grade}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!isReadOnly && entries.length > 0 && (
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                style={{ backgroundColor: '#18564c', color: 'white', borderColor: '#18564c', padding: '10px 24px' }}
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Menyimpan…' : 'Simpan Markah'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
