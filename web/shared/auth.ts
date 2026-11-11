export const staffRoles = ['exam_secretary', 'class_teacher', 'subject_teacher'] as const
export type StaffRole = typeof staffRoles[number]
export interface AccountProfile {
  id: string
  email: string
  displayName: string
  roles: StaffRole[]
}
export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (staffRoles as readonly string[]).includes(value)
}
