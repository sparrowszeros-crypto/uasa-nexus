import { AuthError } from '../../server/auth-core.ts'
import { readSlipRows } from '../../server/slips.ts'
import { staffDataHandler } from '../../server/staff-data.ts'
import { rosterId } from '../../server/roster.ts'
import { calculateGrade } from '../../shared/exams.ts'
import type { SlipClass, SlipPupil, SlipSubject } from '../../shared/slips.ts'

export default staffDataHandler(async (sql, identity, request) => {
  const params = new URL(request.url).searchParams
  const examId = params.has('examId') ? rosterId(params.get('examId')) : null
  const classId = params.has('classId') ? rosterId(params.get('classId')) : null
  const studentId = params.has('studentId') ? rosterId(params.get('studentId')) : null
  const bulk = params.get('mode') === 'bulk'
  if ((bulk && (!examId || !classId || studentId)) || Boolean(examId) !== Boolean(classId) || (studentId && !classId)) {
    throw new AuthError(400, 'Pilihan slip tidak lengkap.')
  }

  const [row] = await readSlipRows(sql, identity, examId, classId, studentId, bulk)
  if (!row.staff) throw new AuthError(403, 'Akses slip memerlukan peranan setiausaha atau guru kelas.')
  if (bulk && !row.secretary) throw new AuthError(403, 'Cetakan pukal hanya untuk setiausaha peperiksaan.')
  if (!examId) return { options: row.options as SlipClass[] }
  if (!row.allowed) throw new AuthError(404, 'Keputusan diterbitkan tidak tersedia untuk kelas ini.')
  function gradeSubjects(items: Omit<SlipSubject, 'grade'>[]) {
    return items.map(item => ({ ...item, grade: calculateGrade(item.mark, item.attendance) }))
  }
  if (bulk) return { slips: (row.slips as { pupil: SlipPupil; subjects: Omit<SlipSubject, 'grade'>[] }[])
    .map(slip => ({ ...slip, subjects: gradeSubjects(slip.subjects) })) }
  if (!studentId) return { pupils: row.pupils as SlipPupil[] }
  if (!row.pupil) throw new AuthError(404, 'Slip murid tidak tersedia.')
  const subjects = gradeSubjects(row.subjects as Omit<SlipSubject, 'grade'>[])
  return { slip: { pupil: row.pupil as SlipPupil, subjects } }
})

export const config = { path: '/api/staff/slips' }
