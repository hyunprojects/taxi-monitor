import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabaseClient'
import logo from './assets/neminstco.png'
import './App.css'

/* ---------- The two OS. SAP ID starting digit decides who owns a driver. ---------- */
const OS_LIST = [
  { key: 'aldrin', label: 'Sir Aldrin', prefix: '1', match: 'aldrin' },
  { key: 'arnel',  label: 'Sir Arnel',  prefix: '2', match: 'arnel'  },
]
const osFromSap = (sap) => OS_LIST.find((o) => o.prefix === String(sap ?? '').trim().charAt(0))?.key || null
const osLabel = (key) => OS_LIST.find((o) => o.key === key)?.label || 'Unassigned'
const osFromName = (name) => {
  const n = (name || '').toLowerCase()
  return OS_LIST.find((o) => n.includes(o.match))?.key || null
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'unmarked', label: 'Unmarked' },
]

const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const shiftDay = (key, delta) => {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + delta))
}
const prettyDay = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

/* ---------- CSV PARSER: phone, name, plate number, sap id ---------- */
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '')
const ALIASES = {
  phone: ['phone', 'phonenumber', 'driversphone', 'driverphone', 'mobile', 'mobilenumber', 'contact', 'contactnumber'],
  name:  ['name', 'fullname', 'drivername', 'driversname'],
  plate: ['plate', 'platenumber', 'plateno', 'vehicleplate', 'drivervehicleplate'],
  sap:   ['sapid', 'sapprofileid', 'sap', 'sapno', 'sapnumber'],
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.trim().split(/\r?\n/)
  const header = splitCsvLine(lines.shift()).map(norm)
  const find = (k) => header.findIndex((h) => ALIASES[k].includes(h))
  const idx = { phone: find('phone'), name: find('name'), plate: find('plate'), sap: find('sap') }

  const missing = ['name', 'sap'].filter((k) => idx[k] < 0)
  if (missing.length) throw new Error(`CSV is missing column(s): ${missing.join(', ')}. Expected: Phone, Name, Plate Number, SAP ID.`)

  return lines.filter((l) => l.trim()).map((line, i) => {
    const c = splitCsvLine(line)
    const get = (k) => (idx[k] >= 0 ? (c[idx[k]] || '').trim() : '')
    const sapRaw = get('sap').replace(/[^0-9]/g, '')
    const sap = parseInt(sapRaw, 10)
    const name = get('name')
    if (!name) throw new Error(`Row ${i + 2}: missing name`)
    if (!Number.isFinite(sap)) throw new Error(`Row ${i + 2} (${name}): invalid SAP ID`)
    return { name, sap, phone: get('phone') || null, plate: get('plate').toUpperCase() || null }
  })
}

/* ---------- Icons ---------- */
const EyeIcon = ({ off }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <line x1="3" y1="3" x2="21" y2="21" />}
  </svg>
)

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
)

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
)

/* ---------- One OS checklist card ---------- */
function Checklist({ title, drivers, attendance, onMark, onAllPresent, onClearDay, busy, emptyText }) {
  const present = drivers.filter((d) => attendance[String(d.id)] === 'present').length
  const absent = drivers.filter((d) => attendance[String(d.id)] === 'absent').length
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <span className="muted">{present} present · {absent} absent · {drivers.length - present - absent} unmarked</span>
        </div>
        {onAllPresent && (
          <div className="check-actions">
            <button type="button" className="btn btn-soft" onClick={onAllPresent} disabled={busy || !drivers.length}>All present</button>
            <button type="button" className="btn btn-soft" onClick={onClearDay} disabled={busy || !drivers.length}>Reset</button>
          </div>
        )}
      </div>
      {drivers.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <ul className="check-list">
          {drivers.map((d) => {
            const s = attendance[String(d.id)] || null
            return (
              <li key={d.id} className={`check-row ${s || ''}`}>
                <span className="avatar">{d.name.charAt(0).toUpperCase()}</span>
                <div className="grow">
                  <span className="check-name">{d.name}</span>
                  <span className="muted check-sub">
                    {d.plate_number || 'No plate'} · {d.phone || 'No phone'} · SAP {d.sap_profile_id}
                  </span>
                </div>
                <div className="seg" role="group" aria-label={`Attendance for ${d.name}`}>
                  <button type="button" className={`seg-btn seg-present ${s === 'present' ? 'on' : ''}`} aria-pressed={s === 'present'} onClick={() => onMark(d, 'present')}>Present</button>
                  <button type="button" className={`seg-btn seg-absent ${s === 'absent' ? 'on' : ''}`} aria-pressed={s === 'absent'} onClick={() => onMark(d, 'absent')}>Absent</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [authInfo, setAuthInfo] = useState(null)
  const [isLogin, setIsLogin] = useState(true)
  const [checkingApproval, setCheckingApproval] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  const [viewingOs, setViewingOs] = useState('all') // 'all' | 'aldrin' | 'arnel'
  const [drivers, setDrivers] = useState([])
  const [attendance, setAttendance] = useState({}) // { [driverId]: 'present' | 'absent' }
  const [attDate, setAttDate] = useState(() => dayKey(new Date()))
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(() => localStorage.getItem('rememberedEmail') || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('rememberedEmail'))

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  /* ---------- Auth bootstrap ---------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    async function checkStatus() {
      if (!session) { setCheckingApproval(false); return }
      setCheckingApproval(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('approved, full_name, is_admin')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) { console.error(error); setProfile(null) }
      else if (data) {
        setProfile(data)
        if (data.approved) {
          // Admin sees everyone. A supervisor is locked to their own list by name (Aldrin / Arnel).
          setViewingOs(data.is_admin ? 'all' : (osFromName(data.full_name) || 'none'))
        }
      } else setProfile(null)
      setCheckingApproval(false)
    }
    checkStatus()
  }, [session])

  useEffect(() => {
    if (session && profile?.approved && viewingOs !== 'none') loadDrivers()
  }, [session, profile, viewingOs])

  useEffect(() => {
    if (session && profile?.approved && viewingOs !== 'none') loadAttendance()
  }, [session, profile, attDate])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [notice])

  const ok = (text) => setNotice({ kind: 'ok', text })
  const fail = (text) => setNotice({ kind: 'error', text })

  async function loadDrivers() {
    setLoading(true)
    let query = supabase.from('drivers').select('*').order('name')
    if (viewingOs !== 'all') query = query.eq('os', viewingOs)
    const { data, error } = await query
    setLoading(false)
    if (error) return fail(`Could not load drivers: ${error.message}`)
    setDrivers(data || [])
  }

  async function loadAttendance() {
    const { data, error } = await supabase.from('attendance').select('driver_id, status').eq('attendance_date', attDate)
    if (error) return fail(`Could not load attendance: ${error.message}`)
    const map = {}
    ;(data || []).forEach((r) => { map[String(r.driver_id)] = r.status })
    setAttendance(map)
  }

  /* ---------- Auth actions ---------- */
  async function handleAuth(e) {
    e.preventDefault()
    setAuthError(null); setAuthInfo(null)
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return setAuthError(error.message)
      if (rememberMe) localStorage.setItem('rememberedEmail', email)
      else localStorage.removeItem('rememberedEmail')
    } else {
      if (password !== confirmPassword) return setAuthError('Passwords do not match.')
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (error) setAuthError(error.message)
      else setAuthInfo('Account created! Check your email for the confirmation link.')
    }
  }

  async function handleForgotPassword() {
    setAuthError(null); setAuthInfo(null)
    if (!email.trim()) return setAuthError('Enter your email above first, then click "Forgot password?".')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    if (error) setAuthError(error.message)
    else setAuthInfo('Password reset link sent. Check your email.')
  }

  async function handleOAuth(provider) {
    setAuthError(null); setAuthInfo(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
    if (error) setAuthError(error.message)
  }

  async function handleSetNewPassword(e) {
    e.preventDefault()
    setAuthError(null)
    if (newPassword.length < 6) return setAuthError('Password must be at least 6 characters.')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return setAuthError(error.message)
    setNewPassword(''); setRecovering(false); ok('Password updated.')
  }

  /* ---------- Attendance actions ---------- */
  // Tap a status to set it; tap the same status again to clear it.
  async function markDriver(d, status) {
    const id = String(d.id)
    const prev = attendance[id] || null
    const next = prev === status ? null : status

    setAttendance((a) => {
      const copy = { ...a }
      if (next) copy[id] = next
      else delete copy[id]
      return copy
    })

    const { error } = next
      ? await supabase.from('attendance').upsert(
          { driver_id: d.id, attendance_date: attDate, status: next, marked_by: session.user.id, updated_at: new Date().toISOString() },
          { onConflict: 'driver_id,attendance_date' }
        )
      : await supabase.from('attendance').delete().eq('driver_id', d.id).eq('attendance_date', attDate)

    if (error) {
      setAttendance((a) => {
        const copy = { ...a }
        if (prev) copy[id] = prev
        else delete copy[id]
        return copy
      })
      fail(`Could not save ${d.name}: ${error.message}`)
    }
  }

  async function markAllPresent(list) {
    if (!list.length) return
    setLoading(true)
    const rows = list.map((d) => ({
      driver_id: d.id, attendance_date: attDate, status: 'present', marked_by: session.user.id, updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'driver_id,attendance_date' })
    setLoading(false)
    if (error) return fail(`Could not mark all present: ${error.message}`)
    ok(`Marked ${list.length} driver(s) present.`)
    loadAttendance()
  }

  async function clearDay(list) {
    if (!list.length) return
    if (!window.confirm(`Reset attendance for ${list.length} driver(s) on ${prettyDay(attDate)}?`)) return
    setLoading(true)
    const { error } = await supabase.from('attendance').delete()
      .eq('attendance_date', attDate).in('driver_id', list.map((d) => d.id))
    setLoading(false)
    if (error) return fail(`Could not reset: ${error.message}`)
    ok('Attendance reset.')
    loadAttendance()
  }

  /* ---------- Driver admin ---------- */
  async function deleteAllDrivers() {
    if (!drivers.length) return
    const scope = viewingOs === 'all' ? 'ALL drivers' : `all of ${osLabel(viewingOs)}'s drivers`
    if (!window.confirm(`Delete ${scope} (${drivers.length}) and their attendance records? This cannot be undone.`)) return
    setLoading(true)
    const ids = drivers.map((d) => d.id)
    const { error: aErr } = await supabase.from('attendance').delete().in('driver_id', ids)
    if (aErr) { setLoading(false); return fail(`Could not delete attendance: ${aErr.message}`) }
    const { error: dErr } = await supabase.from('drivers').delete().in('id', ids)
    setLoading(false)
    if (dErr) return fail(`Could not delete drivers: ${dErr.message}`)
    ok(`Deleted ${ids.length} driver(s).`)
    loadDrivers(); loadAttendance()
  }

  /* ---------- CSV IMPORT: owner is decided by the SAP ID's first digit ---------- */
  async function importCsv(e) {
    const input = e.target
    const file = input.files[0]
    if (!file) return
    input.value = ''

    let rows
    try { rows = parseCsv(await file.text()) } catch (err) { return fail(err.message) }
    if (!rows.length) return fail('CSV is empty.')

    setLoading(true)
    try {
      // Last row wins if the same SAP ID appears twice in the file.
      const bySap = new Map()
      let skipped = 0
      rows.forEach((r) => {
        if (!osFromSap(r.sap)) { skipped++; return }
        bySap.set(r.sap, { ...r, os: osFromSap(r.sap) })
      })
      const clean = [...bySap.values()]
      if (!clean.length) throw new Error('No row has a SAP ID starting with 1 (Sir Aldrin) or 2 (Sir Arnel).')

      const { data: existing, error: exErr } = await supabase.from('drivers').select('id, sap_profile_id')
      if (exErr) throw new Error(exErr.message)
      const idBySap = {}
      ;(existing || []).forEach((d) => { if (d.sap_profile_id != null) idBySap[d.sap_profile_id] = d.id })

      const toInsert = []
      const toUpdate = []
      clean.forEach((r) => {
        const payload = { sap_profile_id: r.sap, name: r.name, plate_number: r.plate, phone: r.phone, os: r.os }
        if (idBySap[r.sap]) toUpdate.push({ id: idBySap[r.sap], payload })
        else toInsert.push({ ...payload, user_id: session.user.id })
      })

      for (let i = 0; i < toInsert.length; i += 500) {
        const { error } = await supabase.from('drivers').insert(toInsert.slice(i, i + 500))
        if (error) throw new Error(`Insert failed: ${error.message}`)
      }
      for (let i = 0; i < toUpdate.length; i += 20) {
        const results = await Promise.all(
          toUpdate.slice(i, i + 20).map((u) => supabase.from('drivers').update(u.payload).eq('id', u.id))
        )
        const bad = results.find((r) => r.error)
        if (bad) throw new Error(`Update failed: ${bad.error.message}`)
      }

      const perOs = OS_LIST.map((o) => `${clean.filter((r) => r.os === o.key).length} ${o.label}`).join(' · ')
      ok([
        `Imported ${clean.length} driver(s): ${perOs}`,
        toInsert.length ? `${toInsert.length} new` : null,
        toUpdate.length ? `${toUpdate.length} updated` : null,
        skipped ? `${skipped} skipped (SAP ID not 1 or 2)` : null,
      ].filter(Boolean).join(' · '))
      loadDrivers()
    } catch (err) {
      fail(err.message)
    } finally {
      setLoading(false)
    }
  }

  /* ---------- Derived data ---------- */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return drivers.filter((d) => {
      const s = attendance[String(d.id)] || 'unmarked'
      if (statusFilter !== 'all' && s !== statusFilter) return false
      if (!q) return true
      return [d.name, d.plate_number, d.phone, String(d.sap_profile_id ?? '')].some((v) => v && v.toLowerCase().includes(q))
    })
  }, [drivers, attendance, statusFilter, search])

  const totals = useMemo(() => {
    let present = 0, absent = 0
    drivers.forEach((d) => {
      const s = attendance[String(d.id)]
      if (s === 'present') present++
      else if (s === 'absent') absent++
    })
    return { total: drivers.length, present, absent, unmarked: drivers.length - present - absent }
  }, [drivers, attendance])

  const perOs = useMemo(() => {
    const rows = OS_LIST.map((o) => {
      const list = drivers.filter((d) => d.os === o.key)
      const present = list.filter((d) => attendance[String(d.id)] === 'present').length
      return { key: o.key, label: o.label, total: list.length, present, pct: list.length ? (present / list.length) * 100 : 0 }
    })
    return rows.filter((r) => viewingOs === 'all' || r.key === viewingOs)
  }, [drivers, attendance, viewingOs])

  const groups = useMemo(() => {
    const keys = viewingOs === 'all' ? [...OS_LIST.map((o) => o.key), null] : [viewingOs]
    return keys
      .map((k) => ({ key: k || 'unassigned', title: k ? osLabel(k) : 'Unassigned drivers', list: visible.filter((d) => (d.os || null) === k) }))
      .filter((g) => g.key !== 'unassigned' || g.list.length > 0)
  }, [visible, viewingOs])

  function exportCsv() {
    const header = ['Date', 'OS', 'Name', 'Plate Number', 'Phone', 'SAP ID', 'Status']
    const rows = drivers.map((d) => [
      attDate, osLabel(d.os), d.name, d.plate_number || '', d.phone || '', d.sap_profile_id ?? '',
      attendance[String(d.id)] || 'unmarked',
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `attendance-${attDate}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  /* ---------- Render: password reset ---------- */
  if (session && recovering) {
    return (
      <div className="auth-container auth-solo">
        <div className="auth-card auth-card-solo">
          <img src={logo} alt="NEMINTSCO" className="auth-solo-logo" />
          <h1>Set New Password</h1>
          <p className="auth-sub">Choose a new password for your account.</p>
          {authError && <div className="notice notice-error">{authError}</div>}
          <form onSubmit={handleSetNewPassword} className="auth-form">
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" type="password" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <button type="submit" className="auth-submit">Update Password</button>
          </form>
        </div>
      </div>
    )
  }

  /* ---------- Render: checking ---------- */
  if (session && checkingApproval) {
    return (
      <div className="auth-container auth-solo">
        <div className="auth-card auth-card-solo">
          <img src={logo} alt="NEMINTSCO" className="auth-solo-logo" />
          <h1>Checking Account...</h1>
        </div>
      </div>
    )
  }

  /* ---------- Render: pending ---------- */
  if (session && profile && !profile.approved) {
    return (
      <div className="auth-container auth-solo">
        <div className="auth-card auth-card-solo">
          <img src={logo} alt="NEMINTSCO" className="auth-solo-logo" />
          <h1>Pending Approval</h1>
          <p className="auth-sub" style={{ marginBottom: 28 }}>
            Your account has been created successfully, but an administrator needs to approve it before you can access the dashboard.
          </p>
          <button type="button" className="auth-submit" onClick={() => supabase.auth.signOut()}>Log Out</button>
        </div>
      </div>
    )
  }

  /* ---------- Render: login ---------- */
  if (!session) {
    return (
      <div className="auth-container">
        <aside className="auth-brand">
          <img src={logo} alt="NEMINTSCO, powered by Green GSM" className="auth-logo" />
          <div className="auth-tagline">
            <h2>Every Driver,<br /><span>Accounted For.</span></h2>
            <p>A simple daily attendance checklist for Sir Aldrin's and Sir Arnel's drivers, built for NEMINTSCO.</p>
          </div>
        </aside>
        <div className="auth-panel">
          <div className="auth-card">
            <h1>{isLogin ? 'Welcome Back!' : 'Create Account'}</h1>
            <p className="auth-sub">{isLogin ? 'Welcome back! Please enter your details!' : 'Sign up to start checking driver attendance.'}</p>
            {authError && <div className="notice notice-error">{authError}</div>}
            {authInfo && <div className="notice notice-ok">{authInfo}</div>}
            <form onSubmit={handleAuth} className="auth-form">
              {!isLogin && (
                <div className="field">
                  <label htmlFor="full-name">Full name</label>
                  <input id="full-name" type="text" placeholder="Full name (e.g. Sir Aldrin)" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="pw-wrap">
                  <input id="password" type={showPassword ? 'text' : 'password'} placeholder="Input password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" className="pw-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
              </div>
              {!isLogin && (
                <div className="field">
                  <label htmlFor="confirm">Re-enter password</label>
                  <input id="confirm" type={showPassword ? 'text' : 'password'} placeholder="Re-enter password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
              )}
              {isLogin && (
                <div className="auth-row">
                  <label className="remember">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    Remember me
                  </label>
                  <button type="button" className="auth-link" onClick={handleForgotPassword}>Forgot password?</button>
                </div>
              )}
              <button type="submit" className="auth-submit">{isLogin ? 'Log In' : 'Sign Up'}</button>
            </form>
            <div className="auth-divider"><span>Or continue with</span></div>
            <div className="auth-social">
              <button type="button" onClick={() => handleOAuth('google')}><GoogleIcon /> Google</button>
              <button type="button" onClick={() => handleOAuth('apple')}><AppleIcon /> Apple</button>
            </div>
            <p className="auth-switch">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button type="button" onClick={() => { setIsLogin(!isLogin); setAuthError(null); setAuthInfo(null) }}>
                {isLogin ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ---------- Render: dashboard ---------- */
  const isAdmin = !!profile?.is_admin
  const isToday = attDate === dayKey(new Date())
  const noOsMatch = viewingOs === 'none'

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src={logo} alt="NEMINTSCO" className="brand-logo" />
            <div>
              <h1>Attendance: <span>{viewingOs === 'all' ? 'All Drivers' : noOsMatch ? 'No list' : osLabel(viewingOs)}</span></h1>
              <p>{isAdmin ? 'Admin Access' : 'Supervisor Access'} • {session.user.email}</p>
            </div>
          </div>
          <div className="header-actions">
            {isAdmin && (
              <select className="admin-select" value={viewingOs} onChange={(e) => setViewingOs(e.target.value)}>
                <option value="all">View Both OS</option>
                {OS_LIST.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            )}
            <button className="btn btn-ghost" onClick={exportCsv} disabled={!drivers.length}>Export CSV</button>
            <button className="btn btn-ghost theme-toggle" onClick={() => setIsDark(!isDark)}>{isDark ? '☀️ Light' : '🌙 Dark'}</button>
            <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Log Out</button>
          </div>
        </div>
      </header>

      <main className="container">
        {notice && <div className={`notice notice-${notice.kind}`}>{notice.text}</div>}

        {noOsMatch && (
          <div className="admin-warning">
            ⚠️ Your account name doesn't match Sir Aldrin or Sir Arnel, so there is no driver list to show. Ask an admin to set your full name to include "Aldrin" or "Arnel".
          </div>
        )}

        {!noOsMatch && (
          <>
            <section className="card date-bar">
              <button type="button" className="btn btn-soft" onClick={() => setAttDate(shiftDay(attDate, -1))} aria-label="Previous day">← Prev</button>
              <div className="date-center">
                <strong>{prettyDay(attDate)}</strong>
                <input type="date" value={attDate} max={dayKey(new Date())} onChange={(e) => e.target.value && setAttDate(e.target.value)} aria-label="Pick a date" />
              </div>
              <div className="date-right">
                {!isToday && <button type="button" className="btn btn-soft" onClick={() => setAttDate(dayKey(new Date()))}>Today</button>}
                <button type="button" className="btn btn-soft" onClick={() => setAttDate(shiftDay(attDate, 1))} disabled={isToday} aria-label="Next day">Next →</button>
              </div>
            </section>

            <section className="stats">
              <div className="stat stat-green">
                <span className="stat-label">Total Drivers</span>
                <strong>{totals.total}</strong>
                <small>{totals.unmarked} not yet marked</small>
              </div>
              <div className="stat">
                <span className="stat-label">Present</span>
                <strong className="pos">{totals.present}</strong>
                <small>{totals.total ? Math.round((totals.present / totals.total) * 100) : 0}% of drivers</small>
              </div>
              <div className="stat">
                <span className="stat-label">Absent</span>
                <strong className="neg">{totals.absent}</strong>
                <small>{totals.total ? Math.round((totals.absent / totals.total) * 100) : 0}% of drivers</small>
              </div>
            </section>

            <div className="grid">
              <div className="col">
                <section className="card toolbar">
                  <input
                    type="search"
                    className="toolbar-search"
                    placeholder="Search name, plate, phone or SAP ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="filter-pills" role="group" aria-label="Filter by status">
                    {FILTERS.map((f) => (
                      <button key={f.key} type="button" className={`pill ${statusFilter === f.key ? 'on' : ''}`} onClick={() => setStatusFilter(f.key)}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </section>

                <div className={viewingOs === 'all' ? 'os-grid' : ''}>
                  {groups.map((g) => {
                    const full = drivers.filter((d) => (d.os || 'unassigned') === g.key)
                    return (
                      <Checklist
                        key={g.key}
                        title={g.title}
                        drivers={g.list}
                        attendance={attendance}
                        onMark={markDriver}
                        busy={loading}
                        onAllPresent={g.key === 'unassigned' ? null : () => markAllPresent(full)}
                        onClearDay={() => clearDay(full)}
                        emptyText={drivers.length === 0 ? 'No drivers yet. Import a CSV to get started.' : 'No drivers match the current filters.'}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="col">
                <section className="card card-hero">
                  <h2>Attendance rate</h2>
                  {perOs.every((r) => r.total === 0) ? <p className="empty">No drivers yet.</p> : (
                    <ol className="leaderboard">
                      {perOs.map((r) => (
                        <li key={r.key}>
                          <div className="lb-row"><span>{r.label}</span><strong>{r.present} / {r.total} present</strong></div>
                          <div className="track"><div className="fill" style={{ width: `${r.pct}%` }} /></div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section className="card">
                  <h2>Import drivers</h2>
                  <p className="muted" style={{ marginBottom: 15 }}>
                    Columns: Phone, Name, Plate Number, SAP ID. A SAP ID starting with <b>1</b> goes to Sir Aldrin, <b>2</b> goes to Sir Arnel. Re-importing updates existing drivers by SAP ID.
                  </p>
                  <label className="import-label import-drop">
                    <span className="import-title">{loading ? 'Working…' : 'Click to upload CSV'}</span>
                    <span className="import-hint">Phone, Name, Plate Number, SAP ID</span>
                    <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={loading} style={{ display: 'none' }} />
                  </label>
                  {isAdmin && (
                    <button type="button" className="btn btn-danger danger-wide" onClick={deleteAllDrivers} disabled={loading || !drivers.length}>
                      🗑️ Delete {viewingOs === 'all' ? 'all' : osLabel(viewingOs) + "'s"} drivers ({drivers.length})
                    </button>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App