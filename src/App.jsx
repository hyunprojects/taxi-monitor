import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabaseClient'
import logo from './assets/neminstco.png'
import './App.css'

const CURRENCY = '₱'
const EXPENSE_CATEGORIES = ['Cash Advance', 'Others']
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

function App() {
  // --- AUTH & ADMIN STATE ---
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [isLogin, setIsLogin] = useState(true)
  const [checkingApproval, setCheckingApproval] = useState(true)

  // --- ADMIN VIEW STATE ---
  const [allSupervisors, setAllSupervisors] = useState([])
  const [viewingOs, setViewingOs] = useState('all')
  const [selectedDriverId, setSelectedDriverId] = useState(null) // For Driver Profile View

  // --- APP STATE ---
  const [drivers, setDrivers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  // --- DARK MODE ---
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // --- FORMS ---
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [driverName, setDriverName] = useState('')
  const [driverPlate, setDriverPlate] = useState('')
  const [type, setType] = useState('income')
  const [selectedDriver, setSelectedDriver] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0])
  const [customReason, setCustomReason] = useState('')
  const [note, setNote] = useState('')

  // --- EDIT MODAL ---
  const [editingTx, setEditingTx] = useState(null)

  // --- FILTERS ---
  const [range, setRange] = useState('7d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [driverFilter, setDriverFilter] = useState('all')
  const [search, setSearch] = useState('')

  // 1. Check Auth Session on Load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // 2. Dark Mode Toggle
  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // 3. Check Approval & Load Profile
  useEffect(() => {
    async function checkStatus() {
      if (!session) {
        setCheckingApproval(false)
        return
      }
      setCheckingApproval(true)
      
      const { data, error } = await supabase
        .from('profiles')
        .select('approved, full_name, is_admin')
        .eq('id', session.user.id)
        .maybeSingle() 

      if (error) {
        console.error("Supabase error fetching profile:", error)
        setProfile(null)
      } else if (data) {
        setProfile(data)
        
        if (data.is_admin) {
          const { data: osList } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('is_admin', false)
          setAllSupervisors(osList || [])
        }

        if (data.approved) {
          setViewingOs(data.is_admin ? 'all' : session.user.id)
        }
      } else {
        setProfile(null)
      }
      setCheckingApproval(false)
    }
    checkStatus()
  }, [session])

  // 4. Load Data when Session or viewingOs changes
  useEffect(() => {
    if (session && profile?.approved) {
      load()
      setSelectedDriverId(null) // Reset driver view when changing OS
    }
  }, [session, profile, viewingOs])

  // 5. Notices Auto-dismiss
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
    let query = supabase.from('transactions').select('*, drivers(name)').order('transaction_date', { ascending: false })
    if (viewingOs !== 'all') query = query.eq('user_id', viewingOs)
    
    const { data, error } = await query
    if (error) return fail(`Could not load transactions: ${error.message}`)
    setTransactions(data || [])
  }

  // --- AUTH ACTIONS ---
  async function handleAuth(e) {
    e.preventDefault()
    setAuthError(null)
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setAuthError(error.message)
    } else {
      if (password !== confirmPassword) return setAuthError('Passwords do not match.')
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (error) setAuthError(error.message)
      else ok('Check your email for the confirmation link!')
    }
  }

  // --- CRUD ACTIONS ---
  async function addDriver(e) {
    e.preventDefault()
    const name = driverName.trim()
    if (!name) return
    if (viewingOs === 'all') return fail('Please select a specific Supervisor first.')
    
    if (drivers.some((d) => d.name.toLowerCase() === name.toLowerCase() && d.user_id === viewingOs)) 
      return fail(`${name} is already on this list.`)

    const { error } = await supabase.from('drivers').insert({ 
      name, 
      plate_number: driverPlate.trim() || null,
      user_id: viewingOs 
    })
    
    if (error) return fail(error.message)
    setDriverName('')
    setDriverPlate('')
    ok(`${name} added to fleet.`)
    fetchDrivers()
  }

  async function deleteDriver(d) {
    if (!window.confirm(`Delete ${d.name}? Their transactions may be removed too.`)) return
    const { error } = await supabase.from('drivers').delete().eq('id', d.id)
    if (error) return fail(`Could not delete ${d.name}: ${error.message}`)
    if (driverFilter === String(d.id)) setDriverFilter('all')
    if (selectedDriverId === d.id) setSelectedDriverId(null)
    ok(`${d.name} deleted.`)
    load()
  }

  async function addTransaction(e) {
    e.preventDefault()
    const value = parseFloat(amount)
    if (!selectedDriver || !value || value <= 0) return fail('Choose a driver and enter an amount above zero.')
    if (viewingOs === 'all') return fail('Please select a specific Supervisor first.')

    const finalNote = type === 'expense' && category === 'Others' 
      ? customReason.trim() 
      : note.trim() || null

    const { error } = await supabase.from('transactions').insert({
      driver_id: selectedDriver,
      amount: value,
      type,
      category: type === 'expense' ? category : null,
      note: finalNote,
      user_id: viewingOs
    })
    if (error) return fail(error.message)
    
    setAmount('')
    setNote('')
    setCustomReason('')
    
    ok(type === 'income' ? `Fare of ${money(value)} recorded.` : `Expense of ${money(value)} recorded.`)
    fetchTransactions()
  }

  async function updateTransaction(e) {
    e.preventDefault()
    const value = parseFloat(editingTx.amount)
    if (!editingTx.driver_id || !value || value <= 0) return fail('Choose a driver and enter an amount above zero.')

    const { error } = await supabase.from('transactions').update({
      driver_id: editingTx.driver_id,
      amount: value,
      type: editingTx.type,
      category: editingTx.type === 'expense' ? editingTx.category : null,
      note: editingTx.note?.trim() || null,
    }).eq('id', editingTx.id)

    if (error) return fail(error.message)
    setEditingTx(null)
    ok('Transaction updated.')
    fetchTransactions()
  }

  async function deleteTransaction(id) {
    if (!window.confirm('Delete this transaction?')) return
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) return fail(error.message)
    ok('Transaction deleted.')
    fetchTransactions()
  }

  // --- FILTERS & DATA CALC ---
  const inRange = useMemo(() => {
    let base = transactions;
    if (selectedDriverId) {
      base = base.filter(t => String(t.driver_id) === selectedDriverId)
    }

    if (range === 'custom') {
      if (!customStart && !customEnd) return base
      return base.filter(t => {
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
      if (!selectedDriverId && driverFilter !== 'all' && String(t.driver_id) !== driverFilter) return false
      if (!q) return true
      return [t.drivers?.name, t.category, t.note].some((v) => v && v.toLowerCase().includes(q))
    })
  }, [inRange, driverFilter, search, selectedDriverId])

  const stats = useMemo(() => {
    let income = 0, expense = 0, fares = 0
    filtered.forEach((t) => {
      const v = Number(t.amount)
      if (t.type === 'expense') expense += v
      else { income += v; fares += 1 }
    })
    return { income, expense, net: income - expense, fares, avg: fares ? income / fares : 0 }
  }, [filtered])

  const leaderboard = useMemo(() => {
    const map = {}
    inRange.forEach((t) => {
      if (t.type === 'expense') return
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
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push({ key: dayKey(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), income: 0, expense: 0 })
    }
    transactions.forEach((t) => {
      if (selectedDriverId && String(t.driver_id) !== selectedDriverId) return;
      if (!selectedDriverId && driverFilter !== 'all' && String(t.driver_id) !== driverFilter) return;
      
      const slot = days.find((d) => d.key === dayKey(t.transaction_date))
      if (!slot) return
      if (t.type === 'expense') slot.expense += Number(t.amount)
      else slot.income += Number(t.amount)
    })
    const max = Math.max(1, ...days.map((d) => Math.max(d.income, d.expense)))
    return { days, max }
  }, [transactions, driverFilter, selectedDriverId])

  function exportCsv() {
    const header = ['Date', 'Driver', 'Type', 'Category', 'Note', 'Amount']
    const rows = filtered.map((t) => [
      new Date(t.transaction_date).toLocaleString(),
      t.drivers?.name || '',
      t.type === 'expense' ? 'Expense' : 'Fare',
      t.category || '',
      t.note || '',
      Number(t.amount).toFixed(2),
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `taxi-report-${dayKey(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (session && checkingApproval) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center', color: '#fff' }}>
          <h1>Checking Account...</h1>
        </div>
      </div>
    )
  }

  if (session && profile && !profile.approved) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <h1>Pending Approval</h1>
          <p style={{ marginTop: '20px', marginBottom: '30px' }}>
            Your account has been created successfully, but an administrator needs to approve it before you can access the dashboard.
          </p>
          <button type="button" className="auth-submit" onClick={() => supabase.auth.signOut()}>
            Log Out
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-container">
        <aside className="auth-brand">
          <img src={logo} alt="NEMINTSCO, powered by Green GSM" />
        </aside>

        <div className="auth-panel">
          <div className="auth-card">
            <h1>{isLogin ? 'Welcome Back' : 'Create New Account'}</h1>
            <p>
              {isLogin
                ? 'Log in to monitor your fleet’s revenue, expenses and driver performance.'
                : 'Create your account to track fares, expenses and driver performance with ease.'}
            </p>
            {authError && <div className="notice notice-error">{authError}</div>}

            <form onSubmit={handleAuth} className="auth-form">
              {!isLogin && (
                <input type="text" placeholder="Full name (e.g. Sir Aldrin)" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              )}
              <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {!isLogin && (
                <input type="password" placeholder="Re-enter password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              )}
              <button type="submit" className="auth-submit">{isLogin ? 'Log In' : 'Submit'}</button>
            </form>
          </div>

          <div className="auth-tabs" role="tablist">
            <button type="button" className={!isLogin ? 'active' : ''} onClick={() => { setIsLogin(false); setAuthError(null) }}>Sign Up</button>
            <button type="button" className={isLogin ? 'active' : ''} onClick={() => { setIsLogin(true); setAuthError(null) }}>Log In</button>
          </div>
        </div>
      </div>
    )
  }

  // --- RENDER: DASHBOARD ---
  const isViewingAll = viewingOs === 'all'
  const currentDriver = selectedDriverId ? drivers.find(d => String(d.id) === selectedDriverId) : null;
  
  let viewTitle = 'All Operations'
  if (currentDriver) {
    viewTitle = `Driver: ${currentDriver.name}`
  } else if (!isViewingAll) {
    viewTitle = (viewingOs === session.user.id ? profile?.full_name : allSupervisors.find(s => s.id === viewingOs)?.full_name)
  }

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
                  <button className="back-btn" onClick={() => setSelectedDriverId(null)}>
                    ← Back
                  </button>
                )}
              </h1>
              <p>{profile?.is_admin ? 'Admin Access' : 'Supervisor Access'} • {session.user.email}</p>
            </div>
          </div>
          <div className="header-actions">
            {profile?.is_admin && (
              <select className="admin-select" value={viewingOs} onChange={(e) => setViewingOs(e.target.value)}>
                <option value="all">View All Supervisors</option>
                {allSupervisors.map(os => (
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
            ⚠️ You are viewing the combined data of all Supervisors. To add drivers or record transactions, please select a specific Supervisor from the top right dropdown.
          </div>
        )}

        <section className="filters">
          <div className="segmented" role="group">
            {RANGES.map((r) => (
              <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="custom-dates">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span>to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          )}
          
          {!currentDriver && (
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
              <option value="all">All my drivers</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          
          <input type="search" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </section>

        <section className="stats">
          <div className="stat stat-green">
            <span className="stat-label">Revenue</span>
            <strong>{money(stats.income)}</strong>
            <small>{stats.fares} fare{stats.fares === 1 ? '' : 's'}</small>
          </div>
          <div className="stat stat-red">
            <span className="stat-label">Expenses</span>
            <strong>{money(stats.expense)}</strong>
            <small>Cash advances, others</small>
          </div>
          <div className={`stat ${stats.net >= 0 ? 'stat-blue' : 'stat-red'}`}>
            <span className="stat-label">Net income</span>
            <strong>{money(stats.net)}</strong>
            <small>Revenue minus expenses</small>
          </div>
          <div className="stat stat-blue-soft">
            <span className="stat-label">Average fare</span>
            <strong>{money(stats.avg)}</strong>
            <small>Per recorded fare</small>
          </div>
        </section>

        <div className="grid">
          <div className="col">
            {!isViewingAll && !currentDriver && (
              <>
                <section className="card">
                  <h2>Record transaction</h2>
                  <div className="toggle" role="group">
                    <button type="button" className={type === 'income' ? 'on-green' : ''} onClick={() => setType('income')}>Fare</button>
                    <button type="button" className={type === 'expense' ? 'on-red' : ''} onClick={() => setType('expense')}>Expense</button>
                  </div>
                  <form onSubmit={addTransaction} className="form">
                    <label>Driver
                      <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)}>
                        <option value="">Select driver</option>
                        {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} {d.plate_number ? `(${d.plate_number})` : ''}</option>)}
                      </select>
                    </label>
                    <label>Amount ({CURRENCY})
                      <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    </label>
                    
                    {type === 'expense' && (
                      <>
                        <label>Category
                          <select value={category} onChange={(e) => setCategory(e.target.value)}>
                            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </label>
                        
                        {category === 'Others' && (
                          <label>Specify Reason
                            <input value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="e.g. Car wash, parking ticket..." required />
                          </label>
                        )}
                      </>
                    )}

                    {(type === 'income' || category === 'Cash Advance') && (
                      <label>Note (optional)
                        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'income' ? "Passenger, route, plate no." : "Additional details..."} />
                      </label>
                    )}

                    <button type="submit" className={`btn ${type === 'income' ? 'btn-green' : 'btn-red'}`}>
                      {type === 'income' ? 'Record fare' : 'Record expense'}
                    </button>
                  </form>
                </section>

                <section className="card">
                  <h2>My Drivers</h2>
                  <form onSubmit={addDriver} className="inline-form">
                    <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver name" />
                    <input value={driverPlate} onChange={(e) => setDriverPlate(e.target.value)} placeholder="Plate No. (Optional)" style={{ maxWidth: '150px' }} />
                    <button type="submit" className="btn btn-blue">Add driver</button>
                  </form>
                  {drivers.length === 0 ? (
                    <p className="empty">No drivers yet.</p>
                  ) : (
                    <ul className="driver-list">
                      {drivers.map((d) => (
                        <li key={d.id} onClick={() => setSelectedDriverId(String(d.id))} className="driver-item-hover">
                          <span className="avatar">{d.name.charAt(0).toUpperCase()}</span>
                          <div className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600 }}>{d.name}</span>
                            {d.plate_number && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Plate: {d.plate_number}</span>}
                          </div>
                          <button className="link-red" onClick={(e) => { e.stopPropagation(); deleteDriver(d); }}>Delete</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            {(isViewingAll || currentDriver) && (
               <section className="card">
                 <h2>{currentDriver ? 'Driver Details' : 'Total Drivers Overview'}</h2>
                 
                 {currentDriver ? (
                   <div className="driver-details">
                     <div>
                       <strong>Name</strong>
                       <p>{currentDriver.name}</p>
                     </div>
                     <div>
                       <strong>Plate Number</strong>
                       <p>{currentDriver.plate_number || 'Not specified'}</p>
                     </div>
                   </div>
                 ) : (
                   <>
                    <p className="muted">Showing all drivers under all supervisors. Click to filter.</p>
                    <ul className="driver-list">
                        {drivers.map((d) => (
                          <li key={d.id} onClick={() => setSelectedDriverId(String(d.id))} className="driver-item-hover">
                            <span className="avatar">{d.name.charAt(0).toUpperCase()}</span>
                            <div className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600 }}>{d.name}</span>
                              {d.plate_number && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Plate: {d.plate_number}</span>}
                            </div>
                          </li>
                        ))}
                    </ul>
                   </>
                 )}
               </section>
            )}
          </div>

          <div className="col">
            <section className="card">
              <h2>Last 7 days</h2>
              <div className="chart">
                {daily.days.map((d) => (
                  <div className="chart-day" key={d.key}>
                    <div className="bars">
                      <div className="bar green" style={{ height: `${(d.income / daily.max) * 100}%` }} />
                      <div className="bar red" style={{ height: `${(d.expense / daily.max) * 100}%` }} />
                    </div>
                    <span>{d.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ADMIN ONLY: Driver Leaderboard */}
            {profile?.is_admin && (
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
            )}
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
                  <tr><th>Date</th><th>Driver</th><th>Details</th><th className="num">Amount</th><th className="num">Actions</th></tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const isExpense = t.type === 'expense'
                    return (
                      <tr key={t.id}>
                        <td>{new Date(t.transaction_date).toLocaleString()}</td>
                        <td>{t.drivers?.name || 'Unknown'}</td>
                        <td>
                          <span className={`tag ${isExpense ? 'tag-red' : 'tag-green'}`}>{isExpense ? t.category || 'Expense' : 'Fare'}</span>{' '}
                          {t.note && <span className="muted">{t.note}</span>}
                        </td>
                        <td className={`num ${isExpense ? 'neg' : 'pos'}`}>{isExpense ? '−' : '+'}{money(t.amount)}</td>
                        <td className="num">
                          <button className="link-blue" onClick={() => setEditingTx(t)}>Edit</button>
                          <button className="link-red" onClick={() => deleteTransaction(t.id)}>Delete</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {editingTx && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Edit Transaction</h2>
            <form onSubmit={updateTransaction} className="form">
              <label>Driver
                <select value={editingTx.driver_id} onChange={(e) => setEditingTx({ ...editingTx, driver_id: e.target.value })}>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label>Amount ({CURRENCY})
                <input type="number" step="0.01" min="0" value={editingTx.amount} onChange={(e) => setEditingTx({ ...editingTx, amount: e.target.value })} />
              </label>
              
              {editingTx.type === 'expense' && (
                <label>Category
                  <select value={editingTx.category || ''} onChange={(e) => setEditingTx({ ...editingTx, category: e.target.value })}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              )}

              <label>Note / Reason
                <input value={editingTx.note || ''} onChange={(e) => setEditingTx({ ...editingTx, note: e.target.value })} />
              </label>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingTx(null)}>Cancel</button>
                <button type="submit" className="btn btn-blue">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App