export type ExitStatus = 'transferred' | 'removed'
export type RosterCommand =
  | { action: 'register'; classId: string; number: string; name: string; date: string }
  | { action: 'rename'; classId: string; studentId: string; name: string }
  | { action: 'exit'; classId: string; studentId: string; status: ExitStatus; date: string }

export interface RosterClass { id: string; name: string; year: number }
export interface Pupil {
  id: string; number: string; name: string; status: 'active' | ExitStatus
  startsOn: string; endsOn: string | null
}
