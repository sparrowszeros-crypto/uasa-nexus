import { useState } from 'react'
import './App.css'
import { AuthGate } from './components/AuthGate'
import { ClassRoster } from './components/ClassRoster'
import { SchoolSetupPanel } from './components/SchoolSetup'
import { StaffScope } from './components/StaffScope'
import { ExamsManagement } from './components/ExamsManagement'
import { MarksEntry } from './components/MarksEntry'
import { useAccount } from './lib/account-context'
import type { AccountProfile } from '../shared/auth'

const roles = {
  secretary: {
    name: 'Setiausaha Peperiksaan',
    description: 'Urus peperiksaan, pengguna dan analisis sekolah.',
    menus: [
      'Dashboard',
      'Peperiksaan',
      'Kelas & Murid',
      'Guru & Penugasan',
      'Akaun Ibu Bapa',
      'Markah',
      'Analisis',
      'Slip Peperiksaan',
    ],
  },
  classTeacher: {
    name: 'Guru Kelas',
    description: 'Urus murid dan slip peperiksaan kelas yang ditugaskan.',
    menus: ['Dashboard', 'Kelas & Murid', 'Slip Peperiksaan'],
  },
  subjectTeacher: {
    name: 'Guru Subjek',
    description: 'Urus markah bagi kelas dan subjek yang ditugaskan.',
    menus: ['Dashboard', 'Markah'],
  },
  parent: {
    name: 'Ibu Bapa',
    description: 'Lihat keputusan anak yang telah diterbitkan.',
    menus: ['Dashboard', 'Anak Saya', 'Slip Peperiksaan'],
  },
} as const

type Role = keyof typeof roles

const moduleDescriptions: Record<string, string> = {
  Peperiksaan:
    'Senarai peperiksaan, tarikh kemasukan markah dan status penerbitan.',
  'Kelas & Murid':
    'Senarai kelas, pendaftaran murid dan sejarah perubahan status.',
  'Guru & Penugasan':
    'Pendaftaran guru serta penugasan kelas dan subjek.',
  'Akaun Ibu Bapa':
    'Pendaftaran akaun, pautan anak dan kod pengaktifan.',
  Markah:
    'Kemasukan markah, semakan dan penghantaran untuk pengesahan.',
  Analisis:
    'Analisis pencapaian mengikut murid, kelas dan subjek.',
  'Slip Peperiksaan':
    'Paparan keputusan dan cetakan slip peperiksaan A4.',
  'Anak Saya':
    'Senarai anak yang telah dipautkan kepada akaun ibu bapa.',
}

function Workspace({ account, logout }: { account: AccountProfile; logout: () => Promise<void> }) {
  const roleMap = { secretary: 'exam_secretary', classTeacher: 'class_teacher', subjectTeacher: 'subject_teacher' } as const
  const availableRoles = (Object.keys(roleMap) as Array<keyof typeof roleMap>).filter(key => account.roles.includes(roleMap[key]))
  const [role, setRole] = useState<Role>(availableRoles[0])
  const [page, setPage] = useState('Dashboard')
  const [rosterVersion, setRosterVersion] = useState(0)
  const profile = roles[role]

  function changeRole(value: Role) {
    setRole(value)
    setPage('Dashboard')
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a className="brand" href="#utama" onClick={() => setPage('Dashboard')}>
          <span className="brand-icon">U</span>
          <span>
            <strong>UASA Nexus</strong>
            <small>Pengurusan Peperiksaan</small>
          </span>
        </a>

        <div className="school-scope">
          <span className="scope-dot" />
          Peralihan · Tingkatan 1–3
        </div>

        <p className="nav-label">RUANG KERJA</p>

        <nav aria-label="Menu utama">
          {profile.menus.map((menu) => (
            <button
              key={menu}
              type="button"
              className={page === menu ? 'nav-item active' : 'nav-item'}
              aria-current={page === menu ? 'page' : undefined}
              onClick={() => setPage(menu)}
            >
              <span className="nav-marker" aria-hidden="true" />
              {menu}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <strong>{profile.name}</strong>
          <span>{account.displayName}</span>
          <span>{account.email}</span>
          <button className="logout-button" type="button" onClick={() => void logout()}>Log keluar</button>
        </div>
      </aside>

      <main id="utama" className="main-content">
        <header className="topbar">
          <span>Sistem Pengurusan Peperiksaan Sekolah</span>
          <span className="preview-badge">SESI PENGUJIAN</span>
        </header>

        <section className="preview-controls" aria-label="Peranan yang ditugaskan">
          <div>
            <strong>Selamat datang, {account.displayName}</strong>
            <p>
              Peranan di bawah ialah penugasan akaun anda yang telah disahkan oleh pelayan.
            </p>
          </div>

          <label>
            <span>Peranan</span>
            <select
              value={role}
              onChange={(event) => changeRole(event.target.value as Role)}
            >
              {availableRoles.map((key) => (
                <option key={key} value={key}>
                  {roles[key].name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="page-heading">
          <div>
            <p className="eyebrow">UASA NEXUS / {profile.name}</p>
            <h1>{page}</h1>
            <p>{profile.description}</p>
          </div>
          <div className="year-chip">Sesi 2027</div>
        </section>

        {page === 'Dashboard' ? (
          <>
            <section className="welcome-panel">
              <div>
                <p className="eyebrow">BERSEDIA UNTUK SESI BAHARU</p>
                <h2>Semua urusan peperiksaan dalam satu ruang.</h2>
                <p>
                  Daripada pengurusan kelas hingga penerbitan keputusan,
                  setiap peranan mempunyai ruang kerja tersendiri.
                </p>
              </div>
              <span className="welcome-emblem" aria-hidden="true">N</span>
            </section>

            <StaffScope accountEmail={account.email} />

            <section className="stats-grid" aria-label="Ringkasan sistem">
              {['Murid Aktif', 'Kelas', 'Peperiksaan', 'Keputusan Diterbitkan'].map(
                (label) => (
                  <article className="stat-card" key={label}>
                    <span>{label}</span>
                    <strong>—</strong>
                    <small>Belum disambungkan kepada data</small>
                  </article>
                ),
              )}
            </section>

            <section className="content-card">
              <div className="card-heading">
                <div>
                  <h2>Ruang kerja anda</h2>
                  <p>Pilih modul untuk melihat susunan awal sistem.</p>
                </div>
              </div>

              <div className="module-grid">
                {profile.menus.filter((menu) => menu !== 'Dashboard').map(
                  (menu) => (
                    <button
                      className="module-card"
                      key={menu}
                      type="button"
                      onClick={() => setPage(menu)}
                    >
                      <strong>{menu}</strong>
                      <span>{moduleDescriptions[menu]}</span>
                      <span className="module-link">Buka modul →</span>
                    </button>
                  ),
                )}
              </div>
            </section>
          </>
        ) : page === 'Kelas & Murid' && (role === 'secretary' || role === 'classTeacher') ? (
          <div className="setup-panel">
            <ClassRoster key={rosterVersion} email={account.email} />
            {role === 'secretary' && <SchoolSetupPanel email={account.email} page="classes" onClassCreated={() => setRosterVersion(v => v + 1)} />}
          </div>
        ) : role === 'secretary' && page === 'Guru & Penugasan' ? (
          <SchoolSetupPanel email={account.email} page="teachers" />
        ) : role === 'secretary' && page === 'Peperiksaan' ? (
          <ExamsManagement email={account.email} />
        ) : (role === 'secretary' || role === 'subjectTeacher') && page === 'Markah' ? (
          <MarksEntry email={account.email} />
        ) : (
          <section className="content-card empty-state">
            <span className="empty-icon" aria-hidden="true">▤</span>
            <h2>{page}</h2>
            <p>{moduleDescriptions[page]}</p>
            <div className="development-note">
              Modul ini masih dalam pembangunan. Tiada data sebenar dibaca
              atau disimpan melalui paparan ini.
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setPage('Dashboard')}
            >
              Kembali ke dashboard
            </button>
          </section>
        )}

        <footer className="page-footer">
          UASA Nexus · Peralihan dan Tingkatan 1–3
        </footer>
      </main>
    </div>
  )
}

function AuthenticatedWorkspace() {
  const { account, logout } = useAccount()
  return <Workspace key={account.id} account={account} logout={logout} />
}

function App() {
  return <AuthGate><AuthenticatedWorkspace /></AuthGate>
}

export default App