export const rosterCsvHeader = 'nombor_daftar,nama_penuh'
export const rosterCsvMaxBytes = 256 * 1024

export function pupilFields(number: unknown, name: unknown) {
  const normalizedNumber = typeof number === 'string' ? number.trim().toUpperCase() : ''
  if (!/^[A-Z0-9][A-Z0-9/_-]{0,29}$/.test(normalizedNumber)) throw new Error('Gunakan nombor daftar sekolah yang sah.')
  const normalizedName = typeof name === 'string' ? name.trim().replace(/ +/g, ' ') : ''
  if (!normalizedName || normalizedName.length > 150 ||
    typeof name !== 'string' || Array.from(name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new Error('Nama penuh tidak sah atau melebihi 150 aksara.')
  }
  return { number: normalizedNumber, name: normalizedName }
}

export function parseRosterCsv(raw: string) {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  const header = lines.shift()?.trim()
  if (!header || !/^(?:"nombor_daftar"|nombor_daftar),(?:"nama_penuh"|nama_penuh)$/.test(header)) {
    throw new Error('Baris 1 mesti mengandungi pengepala ' + rosterCsvHeader + '.')
  }
  const students: (ReturnType<typeof pupilFields> & { line: number })[] = []
  const seen = new Set<string>()
  const rowPattern = /^("(?:[^"]|"")*"|[^",]*),("(?:[^"]|"")*"|[^",]*)$/
  const decode = (value: string) => value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value
  for (const [index, row] of lines.entries()) {
    if (!row.trim()) continue
    const line = index + 2
    try {
      const fields = rowPattern.exec(row)
      if (!fields) throw new Error('Gunakan dua lajur yang dipisahkan dengan koma.')
      const pupil = pupilFields(decode(fields[1]), decode(fields[2]))
      if (seen.has(pupil.number)) throw new Error('Nombor daftar berulang dalam fail.')
      seen.add(pupil.number)
      students.push({ ...pupil, line })
      if (students.length > 800) throw new Error('Had satu import ialah 800 murid.')
    } catch (error) {
      throw new Error('Baris ' + line + ': ' + (error instanceof Error ? error.message : 'Rekod tidak sah.'), { cause: error })
    }
  }
  if (!students.length) throw new Error('Fail CSV tiada rekod murid.')
  return students
}
