import { neon } from '@neondatabase/serverless'
import { authErrorResponse, AuthError, readBearer, requireStaffIdentity } from '../../server/auth-core.ts'
import { verifyAuthToken } from '../../server/staff-data.ts'
import { findStaffAccount } from '../../server/accounts.ts'
import { verifyCaptcha } from '../../server/captcha.ts'
import { verifyPassword, signSessionToken } from '../../server/password.ts'
import { isStaffRole, type AccountProfile } from '../../shared/auth.ts'

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, message: 'Kaedah tidak dibenarkan.' }, {
      status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    })
  }

  const contentType = request.headers.get('content-type') || ''
  const hasAuthHeader = Boolean(request.headers.get('authorization'))

  // 1. Log masuk / pengesahan sesi menggunakan Authorization Bearer (Firebase ID Token atau Session Token)
  if (hasAuthHeader && !contentType.includes('application/json')) {
    try {
      const bearer = readBearer(request.headers.get('authorization'))
      const identity = requireStaffIdentity(await verifyAuthToken(bearer))
      const account = await findStaffAccount(identity)
      if (!account || !account.roles.length || !account.roles.every(isStaffRole)) {
        throw new AuthError(403, 'Akaun tidak aktif, disekat, atau belum diberikan peranan guru. Hubungi setiausaha peperiksaan.')
      }
      return Response.json({ ok: true, account }, {
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      })
    } catch (error) {
      return authErrorResponse(error)
    }
  }

  // 2. Log masuk menggunakan E-mel, Kata Laluan, dan Captcha
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown
      password?: unknown
      captchaKey?: unknown
      captchaAnswer?: unknown
      firebaseIdToken?: unknown
    } | null

    if (!body || typeof body !== 'object') {
      return Response.json({ ok: false, message: 'Format permintaan tidak sah.' }, {
        status: 400, headers: { 'Cache-Control': 'no-store' },
      })
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const captchaKey = typeof body.captchaKey === 'string' ? body.captchaKey : ''
    const captchaAnswer = typeof body.captchaAnswer === 'string' ? body.captchaAnswer.trim() : ''
    const firebaseIdToken = typeof body.firebaseIdToken === 'string' ? body.firebaseIdToken : ''

    if (!email) {
      return Response.json({ ok: false, message: 'Sila masukkan alamat e-mel.' }, {
        status: 400, headers: { 'Cache-Control': 'no-store' },
      })
    }

    // Semakan Captcha
    if (!captchaKey || !captchaAnswer) {
      return Response.json({ ok: false, message: 'Sila lengkapkan kod keselamatan (captcha).' }, {
        status: 400, headers: { 'Cache-Control': 'no-store' },
      })
    }

    const isCaptchaValid = verifyCaptcha(captchaKey, captchaAnswer)
    if (!isCaptchaValid) {
      return Response.json({
        ok: false,
        message: 'Kod keselamatan (captcha) tidak tepat atau telah tamat tempoh. Sila cuba lagi.',
      }, {
        status: 400, headers: { 'Cache-Control': 'no-store' },
      })
    }

    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new AuthError(503, 'Konfigurasi pangkalan data belum sedia.')
    }

    const sql = neon(databaseUrl)

    // Cari akaun mengikut e-mel
    const rows = await sql`
      SELECT a.id, a.email, a.display_name, a.password_hash, a.active, a.failed_attempts, a.locked, a.locked_at,
        COALESCE(array_agg(DISTINCT r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
      FROM accounts a
      LEFT JOIN account_roles r ON r.account_id = a.id
      WHERE a.email = ${email}
      GROUP BY a.id, a.email, a.display_name, a.password_hash, a.active, a.failed_attempts, a.locked, a.locked_at
    `

    const account = rows[0]
    if (!account || !account.active) {
      return Response.json({
        ok: false,
        message: 'E-mel atau kata laluan tidak sah.',
      }, {
        status: 401, headers: { 'Cache-Control': 'no-store' },
      })
    }

    // Semak sekatan akaun
    if (account.locked) {
      return Response.json({
        ok: false,
        message: 'Akaun anda telah disekat kerana 3 kali cubaan kata laluan yang salah. Sila hubungi setiausaha peperiksaan.',
        locked: true,
      }, {
        status: 403, headers: { 'Cache-Control': 'no-store' },
      })
    }

    // Jika telah disahkan melalui Firebase ID Token
    if (firebaseIdToken) {
      try {
        const identity = requireStaffIdentity(await verifyAuthToken(firebaseIdToken))
        if (identity.email.toLowerCase() !== email) {
          throw new AuthError(401, 'E-mel token Firebase tidak sepadan.')
        }

        // Reset cubaan salah
        if (account.failed_attempts > 0) {
          await sql`UPDATE accounts SET failed_attempts = 0 WHERE id = ${account.id}`
        }

        const validRoles = Array.isArray(account.roles) ? account.roles.filter(isStaffRole) : []
        if (!validRoles.length) {
          return Response.json({
            ok: false,
            message: 'Akaun belum diberikan peranan guru atau pentadbir. Sila hubungi setiausaha peperiksaan.',
          }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
        }

        const profile: AccountProfile = {
          id: account.id,
          email: account.email,
          displayName: account.display_name,
          roles: validRoles,
        }

        return Response.json({ ok: true, token: firebaseIdToken, account: profile }, {
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        })
      } catch (err) {
        if (err instanceof AuthError && err.status === 403) throw err
        // Jika token Firebase tidak sah, teruskan semakan password tempatan
      }
    }

    // Semak kata laluan tempatan
    if (!password) {
      return Response.json({ ok: false, message: 'Sila masukkan kata laluan.' }, {
        status: 400, headers: { 'Cache-Control': 'no-store' },
      })
    }

    const isPasswordValid = verifyPassword(password, account.password_hash)

    if (!isPasswordValid) {
      const currentAttempts = typeof account.failed_attempts === 'number' ? account.failed_attempts : 0
      const newFailed = currentAttempts + 1

      if (newFailed >= 3) {
        await sql`
          UPDATE accounts
          SET failed_attempts = ${newFailed}, locked = true, locked_at = now()
          WHERE id = ${account.id}
        `
        return Response.json({
          ok: false,
          message: 'Akaun anda telah disekat selepas 3 kali cubaan kata laluan yang salah. Sila hubungi setiausaha peperiksaan.',
          locked: true,
        }, {
          status: 403, headers: { 'Cache-Control': 'no-store' },
        })
      } else {
        await sql`
          UPDATE accounts
          SET failed_attempts = ${newFailed}
          WHERE id = ${account.id}
        `
        const remaining = 3 - newFailed
        return Response.json({
          ok: false,
          message: `Kata laluan tidak tepat. Baki cubaan: ${remaining} kali sebelum akaun disekat.`,
          remainingAttempts: remaining,
        }, {
          status: 401, headers: { 'Cache-Control': 'no-store' },
        })
      }
    }

    // Jika kata laluan betul, set semula failed_attempts
    if (account.failed_attempts > 0) {
      await sql`
        UPDATE accounts
        SET failed_attempts = 0
        WHERE id = ${account.id}
      `
    }

    const validRoles = Array.isArray(account.roles) ? account.roles.filter(isStaffRole) : []
    if (!validRoles.length) {
      return Response.json({
        ok: false,
        message: 'Akaun belum diberikan peranan guru atau pentadbir. Sila hubungi setiausaha peperiksaan.',
      }, {
        status: 403, headers: { 'Cache-Control': 'no-store' },
      })
    }

    const profile: AccountProfile = {
      id: account.id,
      email: account.email,
      displayName: account.display_name,
      roles: validRoles,
    }

    const sessionToken = signSessionToken({
      uid: account.id,
      email: account.email,
    })

    return Response.json({
      ok: true,
      token: sessionToken,
      account: profile,
    }, {
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}

export const config = { path: '/api/auth/login' }
