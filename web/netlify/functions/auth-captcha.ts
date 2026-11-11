import { generateCaptcha } from '../../server/captcha.ts'

export default async function handler(request: Request) {
  if (request.method !== 'GET') {
    return Response.json(
      { ok: false, message: 'Kaedah tidak dibenarkan.' },
      { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } },
    )
  }

  const { key, svg } = generateCaptcha()
  return Response.json(
    { ok: true, key, svg },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'X-Content-Type-Options': 'nosniff' } },
  )
}

export const config = { path: '/api/auth/captcha' }
