import handler from '../netlify/functions/auth-login.ts'
const cases = [
  { name: 'GET ditolak', request: new Request('http://localhost/api/auth/login'), status: 405 },
  { name: 'POST tanpa token ditolak', request: new Request('http://localhost/api/auth/login', {method:'POST'}), status:401 },
  { name: 'Token palsu ditolak', request: new Request('http://localhost/api/auth/login', {method:'POST', headers:{Authorization:'Bearer not-a-real-token'}}), status:401 },
]
let failed = false
for (const item of cases) {
  const response = await handler(item.request)
  const passed = response.status === item.status
  console.log(JSON.stringify({test:item.name,status:response.status,passed}))
  if (!passed) failed=true
}
if(failed) process.exitCode=1
