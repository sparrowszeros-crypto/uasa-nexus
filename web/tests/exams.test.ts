import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateGrade } from '../shared/exams.ts'

test('calculates correct grades based on school grade scale', () => {
  // Gred A (82 - 100)
  assert.equal(calculateGrade(100, 'present'), 'A')
  assert.equal(calculateGrade(90, 'present'), 'A')
  assert.equal(calculateGrade(82, 'present'), 'A')

  // Gred B (66 - 81)
  assert.equal(calculateGrade(81.9, 'present'), 'B')
  assert.equal(calculateGrade(75, 'present'), 'B')
  assert.equal(calculateGrade(66, 'present'), 'B')

  // Gred C (50 - 65)
  assert.equal(calculateGrade(65.5, 'present'), 'C')
  assert.equal(calculateGrade(58, 'present'), 'C')
  assert.equal(calculateGrade(50, 'present'), 'C')

  // Gred D (35 - 49)
  assert.equal(calculateGrade(49.9, 'present'), 'D')
  assert.equal(calculateGrade(40, 'present'), 'D')
  assert.equal(calculateGrade(35, 'present'), 'D')

  // Gred E (20 - 34)
  assert.equal(calculateGrade(34.5, 'present'), 'E')
  assert.equal(calculateGrade(25, 'present'), 'E')
  assert.equal(calculateGrade(20, 'present'), 'E')

  // Gred F (0 - 19)
  assert.equal(calculateGrade(19.9, 'present'), 'F')
  assert.equal(calculateGrade(10, 'present'), 'F')
  assert.equal(calculateGrade(0, 'present'), 'F')

  // Tidak Hadir (TH)
  assert.equal(calculateGrade(null, 'absent'), 'TH')
  assert.equal(calculateGrade(85, 'absent'), 'TH')

  // Belum dinilai / Pending
  assert.equal(calculateGrade(null, 'pending'), '—')
})
