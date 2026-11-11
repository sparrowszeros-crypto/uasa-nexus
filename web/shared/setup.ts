export const levels = ['PERALIHAN', '1', '2', '3'] as const
export const teacherRoles = ['class_teacher', 'subject_teacher'] as const

export type TeacherRole = typeof teacherRoles[number]
export type SetupCommand =
  | { action: 'class'; year: number; level: typeof levels[number]; name: string }
  | { action: 'subject'; code: string; name: string }
  | { action: 'teacher'; email: string; name: string; roles: TeacherRole[]; initialPassword?: string }
  | { action: 'unlock'; teacherId: string }
  | { action: 'grant' | 'revoke'; teacherId: string; classId: string; subjectId: string | null }

export interface SchoolSetup {
  classes: { id: string; year: number; name: string; level: string }[]
  subjects: { id: string; code: string; name: string; active: boolean }[]
  teachers: { id: string; name: string; email: string; roles: TeacherRole[]; locked?: boolean; failedAttempts?: number }[]
  assignments: { teacherId: string; classId: string; subjectId: string | null }[]
}
