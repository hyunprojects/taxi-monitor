import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabaseClient'
import logo from './assets/neminstco.png'
import './App.css'

const CURRENCY = '₱'
const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

const money = (n) =>
  `${CURRENCY}${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function rangeStart(key) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (key === 'today') return d
  if (key === '7d') { d.setDate(d.getDate() - 6); return d }
  if (key === '30d') { d.setDate(d.getDate() - 29); return d }
  return null
}

/* ---------- CSV PARSER (orders.csv) ----------
   Required columns: Driver Vehicle Plate, Sap Profile Id, Distance
   Optional: Payment Method, Total Pay Display, Date
   Amount used for earnings = Total Pay Display (falls back to Distance if absent)
*/
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

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.trim().split(/\r?\n/)
  const header = splitCsvLine(lines.shift()).map(h => h.trim())

  const need = ['Driver Vehicle Plate', 'Sap Profile Id', 'Distance']
  if (!need.every(n => header.includes(n)))
    throw new Error('CSV missing required columns: ' + need.join(', '))

  const idx = {
    plate:    header.indexOf('Driver Vehicle Plate'),
    sapId:    header.indexOf('Sap Profile Id'),
    distance: header.indexOf('Distance'),
    payment:  header.findIndex(h => h.toLowerCase() === 'payment method'),
    totalPay: header.findIndex(h => h.toLowerCase() === 'total pay display'),
    date:     header.findIndex(h => ['date', 'transaction_date', 'datetime'].includes(h.toLowerCase())),
  }

  return lines.filter(l => l.trim()).map((line, i) => {
    const c = splitCsvLine(line)
    const plate = (c[idx.plate] || '').trim()
    const sapId = parseInt((c[idx.sapId] || '').trim(), 10)
    const distance = parseFloat((c[idx.distance] || '0').replace(/[^0-9.-]+/g, ''))

    let paymentMethod = null
    if (idx.payment >= 0 && c[idx.payment]) paymentMethod = c[idx.payment].trim() || null

    let amount = distance
    if (idx.totalPay >= 0 && c[idx.totalPay]) {
      const parsed = parseFloat(c[idx.totalPay].replace(/[^0-9.-]+/g, ''))
      if (Number.isFinite(parsed)) amount = parsed
    }

    let when = null
    if (idx.date >= 0 && c[idx.date]) {
      const parsed = new Date(c[idx.date].trim())
      if (!isNaN(parsed.getTime())) when = parsed.toISOString()
    }

    if (!plate) throw new Error(`Row ${i + 2}: missing Driver Vehicle Plate`)
    if (!Number.isFinite(sapId)) throw new Error(`Row ${i + 2}: invalid Sap Profile Id`)
    if (!Number.isFinite(distance)) throw new Error(`Row ${i + 2}: invalid Distance`)
    if (!Number.isFinite(amount)) throw new Error(`Row ${i + 2}: invalid Total Pay Display`)

    return { plate, sapId, distance, amount, paymentMethod, when }
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

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [authInfo, setAuthInfo] = useState(null)
  const [isLogin, setIsLogin] = useState(true)
  const [checkingApproval, setCheckingApproval] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  const [allSupervisors, setAllSupervisors] = useState([])
  const [viewingOs, setViewingOs] = useState('all')
  const [selectedDriverId, setSelectedDriverId] = useState(null)

  const [drivers, setDrivers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  const [pendingClearTx, setPendingClearTx] = useState(false)
  const [pendingClearDrivers, setPendingClearDrivers] = useState(false)

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

  const [range, setRange] = useState('7d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')
  const [search, setSearch] = useState('')

  // --- NEW STATE FOR DRIVER LIST SEARCH ---
  const [driverSearch, setDriverSearch] = useState('')

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
        if (data.is_admin) {
          const { data: osList } = await supabase
            .from('profiles').select('id, full_name').eq('is_admin', false)
          setAllSupervisors(osList || [])
        }
        if (data.approved) setViewingOs(data.is_admin ? 'all' : session.user.id)
      } else setProfile(null)
      setCheckingApproval(false)
    }
    checkStatus()
  }, [session])

  useEffect(() => {
    if (session && profile?.approved) { load(); setSelectedDriverId(null) }
  }, [session, profile, viewingOs])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [notice])

  const ok = (text) => setNotice({ kind: 'ok', text })
  const fail = (text) => setNotice({ kind: 'error', text })

  async function load() {
    setLoading(true)
    await Promise.all([fetchDrivers(), fetchTransactions()])
    setLoading(false)
  }

  async function fetchDrivers() {
    let query = supabase.from('drivers').select('*').order('name')
    if (viewingOs !== 'all') query = query.eq('user_id', viewingOs)
    const { data, error } = await query
    if (error) return fail(`Could not load drivers: ${error.message}`)
    setDrivers(data || [])
  }

  async function fetchTransactions() {
    let query = supabase
      .from('transactions')
      .select('*, drivers(name, sap_profile_id, plate_number)')
      .order('transaction_date', { ascending: false })
    if (viewingOs !== 'all') query = query.eq('user_id', viewingOs)
    const { data, error } = await query
    if (error) return fail(`Could not load transactions: ${error.message}`)
    setTransactions(data || [])
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
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    if (error) setAuthError(error.message)
    else setAuthInfo('Password reset link sent. Check your email.')
  }

  async function handleOAuth(provider) {
    setAuthError(null); setAuthInfo(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider, options: { redirectTo: window.location.origin },
    })
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

  /* ---------- CRUD ---------- */
  async function deleteDriver(d) {
    if (!window.confirm(`Delete ${d.name}? Their transactions may be removed too.`)) return
    const { error } = await supabase.from('drivers').delete().eq('id', d.id)
    if (error) return fail(`Could not delete ${d.name}: ${error.message}`)
    if (driverFilter === String(d.id)) setDriverFilter('all')
    if (selectedDriverId === String(d.id)) setSelectedDriverId(null)
    ok(`${d.name} deleted.`)
    load()
  }

  async function deleteTransaction(id) {
    if (!window.confirm('Delete this transaction?')) return
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) return fail(error.message)
    ok('Transaction deleted.')
    fetchTransactions()
  }

  async function clearAllTransactions() {
    if (viewingOs === 'all')
      return fail('Select a specific Supervisor before clearing transactions.')
    if (transactions.length === 0) { setPendingClearTx(false); return fail('There are no transactions to clear.') }

    setLoading(true)
    const { error } = await supabase.from('transactions').delete().eq('user_id', viewingOs)
    setLoading(false); setPendingClearTx(false)

    if (error) return fail(`Could not clear transactions: ${error.message}`)
    ok(`Cleared ${transactions.length} transaction(s). Drivers kept.`)
    load()
  }

  async function deleteAllDrivers() {
    if (viewingOs === 'all')
      return fail('Select a specific Supervisor before bulk deleting drivers.')
    if (drivers.length === 0) { setPendingClearDrivers(false); return fail('There are no drivers to delete.') }

    setLoading(true)
    // Delete transactions FIRST (in case DB has no ON DELETE CASCADE)
    const { error: txError } = await supabase.from('transactions').delete().eq('user_id', viewingOs)
    if (txError) {
      setLoading(false); setPendingClearDrivers(false)
      return fail(`Could not delete transactions: ${txError.message}`)
    }
    const { error: driverError } = await supabase.from('drivers').delete().eq('user_id', viewingOs)
    setLoading(false); setPendingClearDrivers(false)

    if (driverError) return fail(`Could not delete drivers: ${driverError.message}`)
    setDriverFilter('all'); setSelectedDriverId(null)
    ok(`Deleted ${drivers.length} driver(s) and their transactions.`)
    load()
  }

  /* ---------- CSV IMPORT (orders.csv) ---------- */
  async function importCsv(e) {
    const input = e.target
    const file = input.files[0]
    if (!file) return
    input.value = ''
    if (viewingOs === 'all') return fail('Select a specific Supervisor before importing.')

    let rows
    try {
      rows = parseCsv(await file.text())
    } catch (err) {
      return fail(err.message)
    }
    if (!rows.length) return fail('CSV is empty.')

    // 1. Fetch existing drivers to map by BOTH SAP ID and Plate Number
    const { data: existing, error: exErr } = await supabase
      .from('drivers').select('id, sap_profile_id, name, plate_number').eq('user_id', viewingOs)
    if (exErr) return fail(exErr.message)

    // Create lookup maps for faster matching
    const bySap = {}
    const byPlate = {}
    ;(existing || []).forEach(d => {
      if (d.sap_profile_id) bySap[d.sap_profile_id] = d.id
      if (d.plate_number) byPlate[d.plate_number.trim().toUpperCase()] = d.id
      // Fallback: Sometimes the name field holds the plate in older auto-generated data
      if (d.name) byPlate[d.name.trim().toUpperCase()] = d.id
    })

    const newDrivers = []
    const seenSap = new Set()
    const seenPlate = new Set()

    // 2. Identify which drivers need to be created
    rows.forEach(r => {
      const plateUpper = r.plate.trim().toUpperCase()
      const hasSap = bySap[r.sapId]
      const hasPlate = byPlate[plateUpper]
      if (hasSap || hasPlate) return
      if (seenSap.has(r.sapId) || seenPlate.has(plateUpper)) return
      seenSap.add(r.sapId)
      seenPlate.add(plateUpper)
      newDrivers.push({
        user_id: viewingOs,
        sap_profile_id: r.sapId,
        name: r.plate,          // Fallback name
        plate_number: r.plate,  // Save the plate number
      })
    })

    // 3. Insert only the genuinely new drivers
    if (newDrivers.length) {
      const { data: created, error } = await supabase.from('drivers').insert(newDrivers).select()
      if (error) return fail(error.message)
      created.forEach(d => {
        bySap[d.sap_profile_id] = d.id
        byPlate[d.plate_number.trim().toUpperCase()] = d.id
      })
    }

    // 4. Build transactions using the matched IDs
    const nowIso = new Date().toISOString()
    let skipped = 0
    const txns = rows
      .map(r => {
        const plateUpper = r.plate.trim().toUpperCase()
        // Find driver ID by SAP ID first, then fallback to Plate Number
        const driverId = bySap[r.sapId] || byPlate[plateUpper]

        if (!driverId || !Number.isFinite(r.amount)) { skipped++; return null }

        return {
          user_id: viewingOs,
          driver_id: driverId,
          amount: r.amount,
          distance: r.distance,
          payment_method: r.paymentMethod,
          type: 'income',
          note: null,
          source: 'csv_import',
          transaction_date: r.when || nowIso,
        }
      })
      .filter(Boolean) // Remove nulls

    if (!txns.length) return fail(`No valid rows to import${skipped ? ` (${skipped} skipped)` : ''}.`)

    const { error } = await supabase.from('transactions').insert(txns)
    if (error) return fail(error.message)

    ok(`Imported ${txns.length} fare row(s)${skipped ? `, skipped ${skipped}` : ''}.`)
    load()
  }

  /* ---------- Derived data ---------- */

  // --- NEW MEMO FOR FILTERING DRIVERS ---
  const filteredDrivers = useMemo(() => {
    if (!driverSearch.trim()) return drivers
    const q = driverSearch.toLowerCase()
    return drivers.filter(d =>
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.plate_number && d.plate_number.toLowerCase().includes(q)) ||
      (d.sap_profile_id && String(d.sap_profile_id).includes(q))
    )
  }, [drivers, driverSearch])

  const inRange = useMemo(() => {
    let base = transactions
    if (selectedDriverId) base = base.filter((t) => String(t.driver_id) === selectedDriverId)
    if (range === 'custom') {
      if (!customStart && !customEnd) return base
      return base.filter((t) => {
        const d = dayKey(t.transaction_date)
        if (customStart && d < customStart) return false
        if (customEnd && d > customEnd) return false
        return true
      })
    }
    const start = rangeStart(range)
    return base.filter((t) => !start || new Date(t.transaction_date) >= start)
  }, [transactions, range, customStart, customEnd, selectedDriverId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inRange.filter((t) => {
      // If a specific driver is selected, filter ONLY by that driver ID
      if (selectedDriverId) {
        return String(t.driver_id) === selectedDriverId && (
          !q || [t.drivers?.name, t.note, t.payment_method].some((v) => v && v.toLowerCase().includes(q))
        )
      }

      // Otherwise, apply the normal dropdown filter
      if (driverFilter !== 'all' && String(t.driver_id) !== driverFilter) return false
      if (!q) return true
      return [t.drivers?.name, t.note, t.payment_method].some((v) => v && v.toLowerCase().includes(q))
    })
  }, [inRange, driverFilter, search, selectedDriverId])

  // --- NEW: aggregate stats for the top cards ---
  const stats = useMemo(() => {
    let income = 0
    let distance = 0
    filtered.forEach((t) => {
      income += Number(t.amount) || 0
      distance += Number(t.distance) || 0
    })
    return { income, distance, fares: filtered.length }
  }, [filtered])

  const activeStats = useMemo(() => {
    const activePlateSet = new Set()
    const activeDriverIdSet = new Set()
    filtered.forEach((t) => {
      if (t.drivers?.plate_number) activePlateSet.add(t.drivers.plate_number)
      if (t.drivers?.name) activeDriverIdSet.add(t.drivers.name) // using name as driver identifier
    })
    return {
      activeCars: activePlateSet.size,
      activeDrivers: activeDriverIdSet.size,
      trips: filtered.length,
    }
  }, [filtered])

  const leaderboard = useMemo(() => {
    const map = {}
    inRange.forEach((t) => {
      const name = t.drivers?.name || 'Unknown'
      map[name] = (map[name] || 0) + Number(t.amount)
    })
    const rows = Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
    const max = rows[0]?.total || 1
    return rows.map((r) => ({ ...r, pct: (r.total / max) * 100 }))
  }, [inRange])

  const daily = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      days.push({ key: dayKey(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), income: 0 })
    }
    transactions.forEach((t) => {
      if (selectedDriverId && String(t.driver_id) !== selectedDriverId) return
      if (!selectedDriverId && driverFilter !== 'all' && String(t.driver_id) !== driverFilter) return
      const slot = days.find((d) => d.key === dayKey(t.transaction_date))
      if (!slot) return
      slot.income += Number(t.amount)
    })
    const max = Math.max(1, ...days.map((d) => d.income))
    return { days, max }
  }, [transactions, driverFilter, selectedDriverId])

  function exportCsv() {
    const header = ['Date', 'Driver (Plate)', 'SAP Profile ID', 'Distance (km)', 'Payment Method', 'Amount']
    const rows = filtered.map((t) => [
      new Date(t.transaction_date).toLocaleString(),
      t.drivers?.name || '',
      t.drivers?.sap_profile_id ?? '',
      Number(t.distance ?? 0).toFixed(2),
      t.payment_method || '',
      Number(t.amount).toFixed(2),
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `taxi-report-${dayKey(new Date())}.csv`; a.click()
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
            <h2>Every Fare,<br /><span>Clearly Tracked.</span></h2>
            <p>A simple, reliable fleet monitor for revenue, expenses and driver performance, built for NEMINTSCO.</p>
          </div>
        </aside>
        <div className="auth-panel">
          <div className="auth-card">
            <h1>{isLogin ? 'Welcome Back!' : 'Create Account'}</h1>
            <p className="auth-sub">{isLogin ? 'Welcome back! Please enter your details!' : 'Sign up to start tracking fares and expenses.'}</p>
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
  const isViewingAll = viewingOs === 'all'
  const currentDriver = selectedDriverId ? drivers.find((d) => String(d.id) === selectedDriverId) : null

  let viewTitle = 'All Operations'
  if (currentDriver) viewTitle = `Driver: ${currentDriver.name}`
  else if (!isViewingAll) viewTitle = (viewingOs === session.user.id ? profile?.full_name : allSupervisors.find((s) => s.id === viewingOs)?.full_name)

  const canBulkDelete = !isViewingAll

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src={logo} alt="NEMINTSCO" className="brand-logo" />
            <div>
              <h1>
                Dashboard: <span>{viewTitle}</span>
                {currentDriver && (
                  <button className="back-btn" onClick={() => setSelectedDriverId(null)}>← Back</button>
                )}
              </h1>
              <p>{profile?.is_admin ? 'Admin Access' : 'Supervisor Access'} • {session.user.email}</p>
            </div>
          </div>
          <div className="header-actions">
            {profile?.is_admin && (
              <select className="admin-select" value={viewingOs} onChange={(e) => setViewingOs(e.target.value)}>
                <option value="all">View All Supervisors</option>
                {allSupervisors.map((os) => (
                  <option key={os.id} value={os.id}>{os.full_name || 'Unnamed OS'}</option>
                ))}
              </select>
            )}
            <button className="btn btn-ghost" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
            <button className="btn btn-ghost theme-toggle" onClick={() => setIsDark(!isDark)}>{isDark ? '☀️ Light' : '🌙 Dark'}</button>
            <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Log Out</button>
          </div>
        </div>
      </header>

      <main className="container">
        {notice && <div className={`notice notice-${notice.kind}`}>{notice.text}</div>}

        {isViewingAll && (
          <div className="admin-warning">
            ⚠️ You are viewing the combined data of all Supervisors. To import CSV data, please select a specific Supervisor from the top right dropdown.
          </div>
        )}

        <section className="filters">
          <div className="segmented" role="group">
            {RANGES.map((r) => (
              <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>{r.label}</button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="custom-dates">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span>to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
          {!currentDriver && (
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
              <option value="all">All drivers</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <input type="search" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </section>

        <section className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat stat-green">
            <span className="stat-label">Total Earnings</span>
            <strong>{money(stats.income)}</strong>
            <small>{stats.fares} fare{stats.fares === 1 ? '' : 's'} recorded</small>
          </div>
          <div className="stat">
            <span className="stat-label">Total Distance</span>
            <strong>{stats.distance.toFixed(2)} km</strong>
            <small>Sum of trip distances</small>
          </div>
          <div className="stat">
            <span className="stat-label">Avg Fare</span>
            <strong>{money(stats.fares ? stats.income / stats.fares : 0)}</strong>
            <small>Per transaction</small>
          </div>
        </section>

        {/* --- New Active Stats Row --- */}
        <section className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '-10px' }}>
          <div className="stat">
            <span className="stat-label">Active Cars</span>
            <strong>{activeStats.activeCars}</strong>
            <small>Plate numbers with transactions</small>
          </div>
          <div className="stat">
            <span className="stat-label">Active Drivers</span>
            <strong>{activeStats.activeDrivers}</strong>
            <small>Drivers with transactions</small>
          </div>
          <div className="stat">
            <span className="stat-label">Trips</span>
            <strong>{activeStats.trips}</strong>
            <small>Total transactions</small>
          </div>
        </section>

        <div className="grid">
          <div className="col">
            {!isViewingAll && !currentDriver && (
              <section className="card">
                <h2>Import Data</h2>
                <p className="muted" style={{ marginBottom: 15 }}>
                  Upload your CSV to automatically read fares, distance, and payment methods.
                </p>
                <div className="import-row">
                  <label className="import-label" style={{ border: '2px dashed var(--border)', padding: '20px', borderRadius: '8px', display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                    <span className="import-title" style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Click to Upload CSV</span>
                    <span className="import-hint" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      Required: Driver Vehicle Plate, Sap Profile Id, Distance, Total Pay Display
                    </span>
                    <input type="file" accept=".csv,text/csv" onChange={importCsv} style={{ display: 'none' }} />
                  </label>
                </div>
              </section>
            )}

            <section className="card">
              <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h2>{currentDriver ? 'Driver Details' : 'Total Drivers Overview'}</h2>
                {!currentDriver && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

                    {/* --- SEARCH BAR --- */}
                    <input
                      type="search"
                      placeholder="Search name/plate..."
                      value={driverSearch}
                      onChange={(e) => setDriverSearch(e.target.value)}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.85rem', minWidth: '200px' }}
                    />

                    <button
                      type="button"
                      className="btn btn-warning"
                      onClick={() => setPendingClearTx(true)}
                      disabled={loading || !canBulkDelete || transactions.length === 0}
                      title={canBulkDelete ? 'Remove all transactions but keep drivers' : 'Select a specific supervisor first'}
                      style={{ background: '#f59e0b', color: '#1a1a1a', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 500, fontSize: '0.85rem', cursor: canBulkDelete && !loading ? 'pointer' : 'not-allowed', opacity: canBulkDelete && !loading ? 1 : 0.5 }}
                    >
                      🧹 Clear Transactions ({transactions.length})
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setPendingClearDrivers(true)}
                      disabled={loading || !canBulkDelete || drivers.length === 0}
                      title={canBulkDelete ? 'Delete all drivers and their transactions' : 'Select a specific supervisor first'}
                      style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 500, fontSize: '0.85rem', cursor: canBulkDelete && !loading ? 'pointer' : 'not-allowed', opacity: canBulkDelete && !loading ? 1 : 0.5 }}
                    >
                      🗑️ Delete All Drivers ({drivers.length})
                    </button>
                  </div>
                )}
              </div>

              {pendingClearTx && (
                <div style={{ marginBottom: 12, padding: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid #f59e0b', borderRadius: 8 }}>
                  <p style={{ margin: '0 0 10px', fontWeight: 500 }}>
                    Delete all <b>{transactions.length}</b> transactions for this supervisor? Drivers will be kept.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={clearAllTransactions} disabled={loading}
                      style={{ background: '#f59e0b', color: '#1a1a1a', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                      Yes, clear transactions
                    </button>
                    <button className="btn btn-ghost" onClick={() => setPendingClearTx(false)} disabled={loading}>Cancel</button>
                  </div>
                </div>
              )}

              {pendingClearDrivers && (
                <div style={{ marginBottom: 12, padding: 12, background: 'rgba(220,38,38,0.12)', border: '1px solid #dc2626', borderRadius: 8 }}>
                  <p style={{ margin: '0 0 10px', fontWeight: 500 }}>
                    Delete all <b>{drivers.length}</b> drivers AND their transactions? This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={deleteAllDrivers} disabled={loading}
                      style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                      Yes, delete everything
                    </button>
                    <button className="btn btn-ghost" onClick={() => setPendingClearDrivers(false)} disabled={loading}>Cancel</button>
                  </div>
                </div>
              )}

              {currentDriver ? (
                <div className="driver-details">
                  <div><strong>Plate Number</strong><p>{currentDriver.plate_number || currentDriver.name}</p></div>
                  <div><strong>Driver Name</strong><p>{currentDriver.name}</p></div>
                </div>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    {isViewingAll ? 'Showing all drivers under all supervisors.' : 'Click a driver to filter their transactions.'}
                  </p>
                  <ul className="driver-list">
                    {filteredDrivers.map((d) => (
                      <li key={d.id} onClick={() => setSelectedDriverId(String(d.id))} className="driver-item-hover">
                        <span className="avatar">{d.name.charAt(0).toUpperCase()}</span>
                        <div className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{d.name}</span>
                          <span className="muted" style={{ fontSize: '0.8rem' }}>
                            Plate: {d.plate_number || (d.name && d.name.startsWith('NJY') ? d.name : '—')}
                          </span>
                        </div>
                      </li>
                    ))}
                    {filteredDrivers.length === 0 && (
                      <p className="muted" style={{ fontSize: '0.9rem', marginTop: '10px' }}>No drivers match your search.</p>
                    )}
                  </ul>
                </>
              )}
            </section>
          </div>

          <div className="col">
            <section className="card">
              <h2>Last 7 days</h2>
              <div className="chart">
                {daily.days.map((d) => (
                  <div className="chart-day" key={d.key}>
                    <div className="bars">
                      <div className="bar green" style={{ height: `${(d.income / daily.max) * 100}%` }} />
                    </div>
                    <span>{d.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <h2>Driver leaderboard</h2>
              {leaderboard.length === 0 ? <p className="empty">No fares recorded.</p> : (
                <ol className="leaderboard">
                  {leaderboard.map((r, i) => (
                    <li key={r.name}>
                      <div className="lb-row"><span>{i + 1}. {r.name}</span><strong>{money(r.total)}</strong></div>
                      <div className="track"><div className="fill" style={{ width: `${r.pct}%` }} /></div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>

        <section className="card">
          <div className="card-head">
            <h2>{currentDriver ? `${currentDriver.name}'s Transactions` : 'Transactions'}</h2>
            {currentDriver && <span className="muted">{filtered.length} shown</span>}
          </div>
          {!currentDriver ? (
            <p className="empty">Select a driver to view their transactions.</p>
          ) : loading ? (
            <p className="empty">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="empty">No transactions match.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Driver (Plate)</th>
                    <th>Plate Number</th>
                    <th className="num">Distance</th>
                    <th>Payment</th>
                    <th className="num">Amount</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}>
                      <td>{new Date(t.transaction_date).toLocaleString()}</td>
                      <td>{t.drivers?.name || 'Unknown'}</td>
                      <td>{t.drivers?.plate_number || '—'}</td>
                      <td className="num">{Number(t.distance ?? 0).toFixed(2)} km</td>
                      <td style={{ textTransform: 'capitalize' }}>{t.payment_method?.replace(/_/g, ' ') || '—'}</td>
                      <td className="num pos">+{money(t.amount)}</td>
                      <td className="num">
                        <button className="link-red" onClick={() => deleteTransaction(t.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App