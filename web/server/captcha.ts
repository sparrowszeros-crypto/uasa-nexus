import crypto from 'node:crypto'

const CAPTCHA_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const CAPTCHA_TTL_MS = 5 * 60 * 1000 // 5 minit

function getSecretKey(): string {
  return process.env.CAPTCHA_SECRET || process.env.SESSION_SECRET || process.env.DATABASE_URL || 'uasa-captcha-secret-2027'
}

function randomChar(): string {
  const index = crypto.randomInt(0, CAPTCHA_CHARS.length)
  return CAPTCHA_CHARS[index]
}

export function generateCaptcha(): { key: string; svg: string } {
  let text = ''
  for (let i = 0; i < 4; i++) {
    text += randomChar()
  }

  const salt = crypto.randomBytes(8).toString('hex')
  const expiry = Date.now() + CAPTCHA_TTL_MS
  const secret = getSecretKey()

  const answerHash = crypto
    .createHmac('sha256', secret)
    .update(`${text}:${salt}:${expiry}`)
    .digest('hex')

  const payload = JSON.stringify({ expiry, salt, answerHash })
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')

  const key = Buffer.from(JSON.stringify({ payload, signature })).toString('base64url')

  // Bina SVG yang menarik & selamat
  const width = 160
  const height = 54
  const chars = text.split('')

  // Garis herotan latar belakang
  const lines: string[] = []
  for (let i = 0; i < 4; i++) {
    const x1 = crypto.randomInt(5, 30)
    const y1 = crypto.randomInt(5, height - 5)
    const x2 = crypto.randomInt(width - 30, width - 5)
    const y2 = crypto.randomInt(5, height - 5)
    const color = i % 2 === 0 ? '#94a3b8' : '#cbd5e1'
    lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,3" />`)
  }

  // Bintik hingar
  const dots: string[] = []
  for (let i = 0; i < 16; i++) {
    const cx = crypto.randomInt(5, width - 5)
    const cy = crypto.randomInt(5, height - 5)
    dots.push(`<circle cx="${cx}" cy="${cy}" r="1.2" fill="#cbd5e1" />`)
  }

  // Render setiap huruf dengan rotasi sedikit
  const renderedChars = chars.map((char, index) => {
    const x = 24 + index * 32 + crypto.randomInt(-2, 3)
    const y = 35 + crypto.randomInt(-3, 4)
    const rot = crypto.randomInt(-15, 16)
    const colors = ['#0f172a', '#1e3a8a', '#1e293b', '#0369a1']
    const color = colors[index % colors.length]
    return `<text x="${x}" y="${y}" font-family="monospace, monospace" font-size="28" font-weight="700" fill="${color}" transform="rotate(${rot}, ${x}, ${y})">${char}</text>`
  })

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #f8fafc; border-radius: 6px; border: 1px solid #cbd5e1; user-select: none;">
    ${lines.join('\n    ')}
    ${dots.join('\n    ')}
    ${renderedChars.join('\n    ')}
  </svg>`

  return { key, svg }
}

export function verifyCaptcha(key: string, inputAnswer: string): boolean {
  if (!key || typeof key !== 'string') return false
  if (!inputAnswer || typeof inputAnswer !== 'string') return false

  try {
    const raw = Buffer.from(key, 'base64url').toString('utf8')
    const { payload, signature } = JSON.parse(raw) as { payload: string; signature: string }
    const secret = getSecretKey()

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64url')

    if (expectedSignature !== signature) return false

    const { expiry, salt, answerHash } = JSON.parse(payload) as {
      expiry: number
      salt: string
      answerHash: string
    }

    if (typeof expiry !== 'number' || Date.now() > expiry) return false

    const cleanInput = inputAnswer.trim().toUpperCase()
    const checkHash = crypto
      .createHmac('sha256', secret)
      .update(`${cleanInput}:${salt}:${expiry}`)
      .digest('hex')

    const bufCheck = Buffer.from(checkHash, 'hex')
    const bufExpected = Buffer.from(answerHash, 'hex')

    if (bufCheck.length !== bufExpected.length) return false
    return crypto.timingSafeEqual(bufCheck, bufExpected)
  } catch {
    return false
  }
}
