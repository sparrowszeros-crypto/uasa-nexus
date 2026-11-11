import assert from 'node:assert/strict'
import { neon } from '@neondatabase/serverless'
import { staffQueries } from '../server/accounts.ts'
const sql=neon(process.env.DATABASE_URL)
async function exercise(identity, binding) {
  const fixtures=[
    sql.query('CREATE TEMP TABLE accounts (id uuid PRIMARY KEY, email text UNIQUE, display_name text, active boolean) ON COMMIT DROP'),
    sql.query('CREATE TEMP TABLE account_roles (account_id uuid, role text) ON COMMIT DROP'),
    sql.query('CREATE TEMP TABLE account_identities (account_id uuid, provider text, project_id text, subject text, UNIQUE(provider,project_id,subject), UNIQUE(account_id,provider,project_id)) ON COMMIT DROP'),
    sql.query("INSERT INTO accounts VALUES ('11111111-1111-1111-1111-111111111111','teacher@example.test','Teacher',true), ('22222222-2222-2222-2222-222222222222','disabled@example.test','Disabled',false), ('33333333-3333-3333-3333-333333333333','parent@example.test','Parent',true)"),
    sql.query("INSERT INTO account_roles VALUES ('11111111-1111-1111-1111-111111111111','class_teacher'), ('11111111-1111-1111-1111-111111111111','subject_teacher'), ('22222222-2222-2222-2222-222222222222','exam_secretary'), ('33333333-3333-3333-3333-333333333333','parent')"),
  ]
  if(binding) fixtures.push(sql.query("INSERT INTO account_identities VALUES ('11111111-1111-1111-1111-111111111111','firebase',$1,$2)",[binding.project,binding.uid]))
  const result=await sql.transaction([...fixtures,...staffQueries(sql,identity)])
  return result.at(-1)
}
const base={uid:'uid-a',projectId:'project-a',email:'teacher@example.test',emailVerified:true,provider:'google.com'}
try {
  const fresh=await exercise(base)
  assert.equal(fresh.length,1)
  assert.deepEqual(fresh[0].roles,['class_teacher','subject_teacher'])
  console.log('PASS: registered staff can be bound with multiple roles')
  assert.equal((await exercise(base,{project:'project-a',uid:'uid-a'})).length,1)
  console.log('PASS: existing UID can return')
  for(const item of [
    {name:'another UID cannot take over the account',identity:{...base,uid:'uid-b'},binding:{project:'project-a',uid:'uid-a'}},
    {name:'inactive account is denied',identity:{...base,email:'disabled@example.test'}},
    {name:'unregistered email is denied',identity:{...base,email:'unknown@example.test'}},
    {name:'parent role alone is denied staff access',identity:{...base,email:'parent@example.test'}},
  ]) {
    assert.equal((await exercise(item.identity,item.binding)).length,0)
    console.log('PASS: '+item.name)
  }
  console.log('6 database checks passed. Temporary tables were automatically dropped.')
} catch {
  console.error('Database checks failed; no connection details are displayed.')
  process.exitCode=1
}
