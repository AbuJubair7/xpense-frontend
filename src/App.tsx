import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Users, BarChart3,
  Plus, Trash2, RefreshCw, Coins, CreditCard,
  X, HelpCircle, LogOut,
  Eye, EyeOff, List, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell
} from 'recharts';
import { api, setAuthToken } from './api';
import type { Asset, Loan, Borrowing, Income, Expense, HistoryResponse, AveragesResponse, AuthUser } from './api';

const CATEGORIES = ['Food', 'Rent', 'Shopping', 'Travel', 'Utilities', 'Others'];

// Vibrant distinct colours for each expense category in the pie chart
const PIE_COLORS = [
  '#6366f1', // indigo   — Food
  '#f59e0b', // amber    — Rent
  '#10b981', // emerald  — Shopping
  '#3b82f6', // blue     — Travel
  '#8b5cf6', // violet   — Utilities
  '#f43f5e', // rose     — Others
];

// Bar heat-map: low spend = green, mid = amber, high = red (HSL interpolation)
function getBarColor(value: number, min: number, max: number): string {
  if (max <= min) return '#6366f1'; // single bar fallback
  const ratio = (value - min) / (max - min); // 0 → 1
  // hue goes 145 (green) → 40 (amber) → 0 (red)
  const hue = Math.round(145 - ratio * 145);
  const sat = Math.round(62 + ratio * 18);  // 62% → 80%
  const lit = Math.round(50 - ratio * 8);   // 50% → 42%
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

type Tab = 'dashboard' | 'ledger' | 'history' | 'averages';

/* ── default date range helpers ──────────────────────────────── */
const todayStr  = () => new Date().toISOString().split('T')[0];
const daysAgo   = (n: number) => new Date(Date.now() - n * 864e5).toISOString().split('T')[0];
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7); };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const thisYear  = () => String(new Date().getFullYear());
const lastYear  = () => String(new Date().getFullYear() - 1);

const defaultRanges = {
  day:   { from: daysAgo(30),     to: todayStr() },
  month: { from: monthsAgo(5),    to: thisMonth() },
  year:  { from: lastYear(),      to: thisYear()  },
};

/* ── X-axis label formatter per filter mode ──────────────────── */
function fmtPeriodTick(period: string, mode: string): string {
  try {
    if (mode === 'day') {
      const d = new Date(period + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    if (mode === 'month') {
      const [y, m] = period.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
  } catch {}
  return period; // year or fallback
}

/* ── helpers ─────────────────────────────────────────────────── */
const assetLabel = (type: string) =>
  type === 'bank' ? 'Bank' : type === 'wallet' ? 'Digital Wallet' : 'On Hand';

const assetBadgeClass = (type: string) =>
  type === 'bank' ? 'bank-badge' : type === 'wallet' ? 'wallet-badge' : 'hand-badge';

function fmt(value: number, visible: boolean) {
  return visible
    ? `৳${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '••••••';
}

/* ── custom tooltip ──────────────────────────────────────────── */
function ChartTooltip({ active, payload, label, visible }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#888', marginBottom: 4 }}>{label}</p>
      <p style={{ fontWeight: 800, fontSize: '1rem', color: '#0a0a0a' }}>
        {visible ? `৳${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '••••••'}
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════════════════════════ */
export default function App() {
  /* auth */
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const s = localStorage.getItem('user');
    return s ? JSON.parse(s) : null;
  });
  const [authTab, setAuthTab]             = useState<'login' | 'register'>('login');
  const [authName, setAuthName]           = useState('');
  const [authEmail, setAuthEmail]         = useState('');
  const [authPassword, setAuthPassword]   = useState('');
  const [authConfirm, setAuthConfirm]     = useState('');
  const [authMsg, setAuthMsg]             = useState('');

  /* app state */
  const [tab, setTab]                     = useState<Tab>('dashboard');
  const [showBal, setShowBal]             = useState(() => localStorage.getItem('showBal') !== 'false');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  /* data */
  const [assets, setAssets]               = useState<Asset[]>([]);
  const [loans, setLoans]                 = useState<Loan[]>([]);
  const [borrowings, setBorrowings]       = useState<Borrowing[]>([]);
  const [historyData, setHistoryData]     = useState<HistoryResponse | null>(null);
  const [averagesData, setAveragesData]   = useState<AveragesResponse | null>(null);
  const [ledgerIncomes, setLedgerIncomes] = useState<Income[]>([]);
  const [ledgerExpenses, setLedgerExpenses] = useState<Expense[]>([]);

  /* filters — initialise with sensible defaults so charts load immediately */
  const [historyFilter, setHistoryFilter] = useState<'day'|'month'|'year'>('month');
  const [dayRange, setDayRange]           = useState(defaultRanges.day);
  const [monthRange, setMonthRange]       = useState(defaultRanges.month);
  const [yearRange, setYearRange]         = useState(defaultRanges.year);
  const [avgFilter, setAvgFilter]         = useState<'day'|'month'|'year'>('month');
  const [avgRange, setAvgRange]           = useState(defaultRanges.month);
  const [ledgerAsset, setLedgerAsset]     = useState('all');
  const [ledgerDate, setLedgerDate]       = useState({ from: '', to: '' });

  /* forms */
  const [incomeForm, setIncomeForm] = useState({ source: '', amount: '', date: today(), description: '', assetId: '' });
  const [expenseForm, setExpenseForm] = useState({ title: '', amount: '', category: 'Food', date: today(), description: '', assetId: '' });
  const [newAsset, setNewAsset]     = useState({ name: '', type: 'bank' as Asset['type'], balance: 0 });
  const [newLoan, setNewLoan]       = useState({ debtorName: '', amount: 0, date: today(), description: '' });
  const [newBorrowing, setNewBorrowing] = useState({ lenderName: '', amount: 0, date: today(), description: '' });

  /* modals */
  const [assetModal, setAssetModal]   = useState(false);
  const [loanModal, setLoanModal]     = useState(false);
  const [borrowModal, setBorrowModal] = useState(false);

  function today() { return new Date().toISOString().split('T')[0]; }

  /* ── data loaders ─────────────────────────────────────────── */
  const loadDashboard = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError(null);
    try {
      const [a, l, b] = await Promise.all([api.getAssets(), api.getLoans(), api.getBorrowings()]);
      setAssets(a); setLoans(l); setBorrowings(b);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized')) handleLogout();
      else setError(e.message || 'Failed to load data.');
    } finally { setLoading(false); }
  }, [currentUser]);

  const loadLedger = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError(null);
    try {
      const [a, inc, exp] = await Promise.all([api.getAssets(), api.getIncome(), api.getExpenses()]);
      setAssets(a); setLedgerIncomes(inc); setLedgerExpenses(exp);
    } catch (e: any) { setError(e.message || 'Failed to load ledger.'); }
    finally { setLoading(false); }
  }, [currentUser]);

  const loadHistory = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError(null);
    try {
      let params: any = {};
      if (historyFilter === 'day') params = { fromDay: dayRange.from, toDay: dayRange.to };
      else if (historyFilter === 'month') params = { fromMonth: monthRange.from, toMonth: monthRange.to };
      else params = { fromYear: yearRange.from, toYear: yearRange.to };
      setHistoryData(await api.getHistory(params));
    } catch (e: any) { setError(e.message || 'Failed to load history.'); }
    finally { setLoading(false); }
  }, [currentUser, historyFilter, dayRange, monthRange, yearRange]);

  const loadAverages = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError(null);
    try {
      setAveragesData(await api.getAverages({ type: avgFilter, fromDate: avgRange.from, toDate: avgRange.to }));
    } catch (e: any) { setError(e.message || 'Failed to load averages.'); }
    finally { setLoading(false); }
  }, [currentUser, avgFilter, avgRange]);

  /* ── effects ──────────────────────────────────────────────── */
  useEffect(() => { if (currentUser) loadDashboard(); }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (tab === 'ledger') loadLedger();
    else if (tab === 'history') loadHistory();
    else if (tab === 'averages') loadAverages();
  }, [tab, historyFilter, dayRange, monthRange, yearRange, avgFilter, avgRange]);

  useEffect(() => {
    if (assets.length === 0) {
      setIncomeForm(p => ({ ...p, assetId: '' }));
      setExpenseForm(p => ({ ...p, assetId: '' }));
      return;
    }
    setIncomeForm(p => (!p.assetId || !assets.some(a => a.id === p.assetId) ? { ...p, assetId: assets[0].id } : p));
    setExpenseForm(p => {
      const onHand = assets.find(a => a.type === 'on_hand');
      if (onHand) return (!p.assetId || !assets.find(a => a.id === p.assetId && a.type === 'on_hand')) ? { ...p, assetId: onHand.id } : p;
      return (!p.assetId || !assets.some(a => a.id === p.assetId)) ? { ...p, assetId: assets[0].id } : p;
    });
  }, [assets]);

  /* ── auth handlers ────────────────────────────────────────── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const res = await api.login({ email: authEmail, passwordPlain: authPassword });
      setAuthToken(res.access_token);
      localStorage.setItem('user', JSON.stringify(res.user));
      setCurrentUser(res.user);
      setAuthPassword('');
    } catch (e: any) { setError(e.message || 'Login failed.'); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setAuthMsg('');
    if (authPassword !== authConfirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await api.register({ name: authName, email: authEmail, passwordPlain: authPassword });
      setAuthMsg('Account created! Please sign in.');
      setAuthTab('login');
      setAuthName(''); setAuthPassword(''); setAuthConfirm('');
    } catch (e: any) { setError(e.message || 'Registration failed.'); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    setAuthToken(null); localStorage.removeItem('user'); setCurrentUser(null);
    setAssets([]); setLoans([]); setBorrowings([]);
    setHistoryData(null); setAveragesData(null);
    setLedgerIncomes([]); setLedgerExpenses([]);
    setTab('dashboard'); setAuthEmail(''); setAuthPassword(''); setError(null); setAuthMsg('');
  };

  /* ── CRUD handlers ────────────────────────────────────────── */
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.createAsset(newAsset); setAssetModal(false); setNewAsset({ name: '', type: 'bank', balance: 0 }); loadDashboard(); }
    catch (e: any) { setError(e.message || 'Failed to create asset.'); }
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.createLoan(newLoan); setLoanModal(false); setNewLoan({ debtorName: '', amount: 0, date: today(), description: '' }); loadDashboard(); }
    catch (e: any) { setError(e.message || 'Failed to record loan.'); }
  };

  const handleCreateBorrowing = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.createBorrowing(newBorrowing); setBorrowModal(false); setNewBorrowing({ lenderName: '', amount: 0, date: today(), description: '' }); loadDashboard(); }
    catch (e: any) { setError(e.message || 'Failed to record borrowing.'); }
  };

  const handleSettleLoan = async (id: string) => {
    try { await api.settleLoan(id); loadDashboard(); } catch (e: any) { setError(e.message || 'Failed.'); }
  };
  const handleDeleteLoan = async (id: string) => {
    if (!confirm('Delete this loan?')) return;
    try { await api.deleteLoan(id); loadDashboard(); } catch (e: any) { setError(e.message || 'Failed.'); }
  };
  const handleSettleBorrowing = async (id: string) => {
    try { await api.settleBorrowing(id); loadDashboard(); } catch (e: any) { setError(e.message || 'Failed.'); }
  };
  const handleDeleteBorrowing = async (id: string) => {
    if (!confirm('Delete this borrowing?')) return;
    try { await api.deleteBorrowing(id); loadDashboard(); } catch (e: any) { setError(e.message || 'Failed.'); }
  };

  const handleLogIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(incomeForm.amount);
    if (!incomeForm.source || isNaN(amount) || amount <= 0 || !incomeForm.assetId) {
      setError('Please fill all required fields and select an asset.'); return;
    }
    try {
      await api.createIncome({ source: incomeForm.source, amount, date: incomeForm.date, description: incomeForm.description, assetId: incomeForm.assetId });
      setIncomeForm(p => ({ source: '', amount: '', date: today(), description: '', assetId: p.assetId }));
      loadDashboard();
    } catch (e: any) { setError(e.message || 'Failed to log income.'); }
  };

  const handleLogExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expenseForm.amount);
    if (!expenseForm.title || isNaN(amount) || amount <= 0 || !expenseForm.assetId) {
      setError('Please fill all required fields and select an asset.'); return;
    }
    try {
      await api.createExpense({ title: expenseForm.title, amount, category: expenseForm.category, date: expenseForm.date, description: expenseForm.description, assetId: expenseForm.assetId });
      setExpenseForm(p => ({ title: '', amount: '', category: 'Food', date: today(), description: '', assetId: p.assetId }));
      loadDashboard();
    } catch (e: any) { setError(e.message || 'Failed to log expense.'); }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    try { await api.deleteExpense(id); if (tab === 'history') loadHistory(); else loadDashboard(); }
    catch (e: any) { setError(e.message || 'Failed.'); }
  };

  const handleDeleteLedger = async (item: { id: string; type: 'credit' | 'debit' }) => {
    if (!confirm(`Delete this ${item.type === 'credit' ? 'income' : 'expense'} record?`)) return;
    try {
      if (item.type === 'credit') await api.deleteIncome(item.id);
      else await api.deleteExpense(item.id);
      loadLedger();
    } catch (e: any) { setError(e.message || 'Failed.'); }
  };

  /* ── derived values ──────────────────────────────────────── */
  const totalAssets    = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLent      = loans.reduce((s, l) => s + (l.isSettled ? 0 : Number(l.amount)), 0);
  const totalBorrowed  = borrowings.reduce((s, b) => s + (b.isSettled ? 0 : Number(b.amount)), 0);
  const netWorth       = totalAssets + totalLent - totalBorrowed;

  const toggleBal = () => { const n = !showBal; setShowBal(n); localStorage.setItem('showBal', String(n)); };

  /* ledger merged data */
  const ledgerItems = [
    ...ledgerIncomes.map(i => ({ id: i.id, type: 'credit' as const, title: i.source, amount: Number(i.amount), date: i.date, description: i.description, assetName: i.asset?.name || '—', assetType: i.asset?.type || 'bank', assetId: i.asset?.id || '' })),
    ...ledgerExpenses.map(e => ({ id: e.id, type: 'debit' as const, title: e.title, amount: Number(e.amount), date: e.date, description: e.description, assetName: e.asset?.name || '—', assetType: e.asset?.type || 'bank', assetId: e.asset?.id || '' }))
  ].filter(it => {
    if (ledgerAsset !== 'all' && it.assetId !== ledgerAsset) return false;
    if (ledgerDate.from && it.date < ledgerDate.from) return false;
    if (ledgerDate.to && it.date > ledgerDate.to) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  /* ── AUTH SCREEN ─────────────────────────────────────────── */
  if (!currentUser) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          {/* Logo */}
          <div className="auth-logo">
            <div className="auth-logo-mark">X</div>
            <span className="auth-logo-text">xpense</span>
          </div>

          <h1 className="auth-headline">{authTab === 'login' ? 'Welcome back' : 'Create account'}</h1>
          <p className="auth-sub">
            {authTab === 'login' ? 'Sign in to your financial dashboard.' : 'Start tracking your finances today.'}
          </p>

          {/* Notices */}
          {error && (
            <div className="notice notice-error" style={{ marginBottom: 16 }}>
              <span>{error}</span>
              <button className="btn-ghost" onClick={() => setError(null)}><X size={15} /></button>
            </div>
          )}
          {authMsg && (
            <div className="notice notice-success" style={{ marginBottom: 16 }}>
              <span>{authMsg}</span>
            </div>
          )}

          {/* Tab switch */}
          <div className="seg" style={{ marginBottom: 24 }}>
            <button className={`seg-btn ${authTab === 'login' ? 'active' : ''}`} onClick={() => { setAuthTab('login'); setError(null); }}>Sign In</button>
            <button className={`seg-btn ${authTab === 'register' ? 'active' : ''}`} onClick={() => { setAuthTab('register'); setError(null); }}>Create Account</button>
          </div>

          {authTab === 'login' ? (
            <form onSubmit={handleLogin} style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="form-label">Email</label>
                <input type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Password</label>
                <input type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-black btn-full" disabled={loading} style={{ marginTop: 6 }}>
                {loading ? <RefreshCw size={16} className="spin" /> : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="form-label">Full Name</label>
                <input type="text" placeholder="John Doe" value={authName} onChange={e => setAuthName(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Password (min 6)</label>
                <input type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} minLength={6} required />
              </div>
              <div>
                <label className="form-label">Confirm Password</label>
                <input type="password" placeholder="••••••••" value={authConfirm} onChange={e => setAuthConfirm(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-black btn-full" disabled={loading} style={{ marginTop: 6 }}>
                {loading ? <RefreshCw size={16} className="spin" /> : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  /* ── APP SHELL ───────────────────────────────────────────── */
  const navItems: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <Wallet size={18} />, label: 'Dashboard' },
    { id: 'ledger',    icon: <List size={18} />,   label: 'Asset Ledger' },
    { id: 'history',   icon: <BarChart3 size={18} />, label: 'Transaction History' },
    { id: 'averages',  icon: <TrendingUp size={18} />, label: 'Averages Analysis' },
  ];

  return (
    <div className="app-shell">

      {/* ── MOBILE HEADER ─────────────────────────────────── */}
      <header className="mobile-header">
        <div className="mobile-logo">
          <div className="mobile-logo-mark">X</div>
          <span style={{ color: '#fff' }}>xpense</span>
        </div>
        <div className="mobile-header-right">
          <button className="mobile-icon-btn" onClick={toggleBal} title={showBal ? 'Hide balances' : 'Show balances'}>
            {showBal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button className="mobile-icon-btn" onClick={handleLogout} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ── MOBILE BOTTOM BAR ─────────────────────────────── */}
      <nav className="bottom-bar">
        {navItems.map(n => (
          <button key={n.id} className={`bottom-tab ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
            {n.icon}
            <span>{n.id === 'dashboard' ? 'Home' : n.id === 'ledger' ? 'Ledger' : n.id === 'history' ? 'History' : 'Averages'}</span>
          </button>
        ))}
      </nav>

      {/* ── DESKTOP SIDEBAR ───────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">X</div>
          <span className="sidebar-logo-text">xpense</span>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{currentUser.name.charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-name">{currentUser.name}</div>
            <div className="sidebar-user-email">{currentUser.email}</div>
          </div>
        </div>

        <div className="sidebar-nav-label">Navigation</div>

        {navItems.map(n => (
          <button key={n.id} className={`nav-btn ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}

        <div className="sidebar-spacer" />

        <button className="sidebar-signout" onClick={handleLogout}>
          <LogOut size={17} />
          <span>Sign Out</span>
        </button>
      </aside>

      {/* ── MAIN CONTENT ──────────────────────────────────── */}
      <main className="main-content">

        {/* global notice */}
        {error && (
          <div className="notice notice-error">
            <span>{error}</span>
            <button className="btn-ghost" onClick={() => setError(null)}><X size={15} /></button>
          </div>
        )}

        {loading && (
          <div className="loading-row">
            <RefreshCw size={15} className="spin" />
            <span>Syncing data…</span>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB 1 — DASHBOARD
        ══════════════════════════════════════════════════ */}
        {tab === 'dashboard' && (
          <>
            <div className="page-header">
              <div>
                <div className="page-eyebrow">Overview</div>
                <h1 className="page-title">Dashboard</h1>
                <p className="page-sub">Monitor your assets, track debtors, and log transactions.</p>
              </div>
              <div className="header-btns">
                <button className="toggle-eye" onClick={toggleBal} title={showBal ? 'Hide balances' : 'Show balances'}>
                  {showBal ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button className="btn btn-outline" onClick={loadDashboard}><RefreshCw size={15} />Refresh</button>
              </div>
            </div>

            {/* Stats */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-card-top">
                  <span className="stat-label">Liquid Assets</span>
                  <div className="stat-icon"><Wallet size={16} /></div>
                </div>
                <div className="stat-value">{fmt(totalAssets, showBal)}</div>
                <div className="stat-hint">Cash, bank & wallet balances</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-top">
                  <span className="stat-label">Net Balance</span>
                  <div className="stat-icon"><Coins size={16} /></div>
                </div>
                <div className="stat-value" style={{ color: netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(netWorth, showBal)}</div>
                <div className="stat-hint">Assets + Lent − Borrowed</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-top">
                  <span className="stat-label">Loans Lent</span>
                  <div className="stat-icon"><ArrowUpRight size={16} /></div>
                </div>
                <div className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(totalLent, showBal)}</div>
                <div className="stat-hint">Outstanding money owed to you</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-top">
                  <span className="stat-label">Borrowed</span>
                  <div className="stat-icon"><ArrowDownRight size={16} /></div>
                </div>
                <div className="stat-value" style={{ color: 'var(--red)' }}>{fmt(totalBorrowed, showBal)}</div>
                <div className="stat-hint">Money you owe to others</div>
              </div>
            </div>

            {/* Main grid */}
            <div className="dashboard-grid">

              {/* LEFT COLUMN */}
              <div className="left-col">

                {/* ASSETS */}
                <div className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="card-icon"><Wallet size={16} /></div>
                      <span className="card-title">Assets</span>
                    </div>
                    <button className="btn btn-black btn-sm" onClick={() => setAssetModal(true)}><Plus size={14} />Add Asset</button>
                  </div>
                  {assets.length === 0 ? (
                    <div className="empty-state">No assets yet. Add a bank account, digital wallet, or cash on hand.</div>
                  ) : (
                    <div className="asset-grid">
                      {assets.map(a => (
                        <div key={a.id} className="asset-card">
                          <div className="asset-card-top">
                            {a.type === 'bank' && <CreditCard size={18} color="#111" />}
                            {a.type === 'wallet' && <Wallet size={18} color="#555" />}
                            {a.type === 'on_hand' && <Coins size={18} color="var(--green)" />}
                            <span className={`asset-type-badge ${assetBadgeClass(a.type)}`}>{assetLabel(a.type)}</span>
                          </div>
                          <div className="asset-name">{a.name}</div>
                          <div className="asset-balance">{fmt(Number(a.balance), showBal)}</div>
                          <div className="asset-updated">Updated {new Date(a.updatedAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* DEBTOR TRACKING */}
                <div className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="card-icon amber-icon"><Users size={16} /></div>
                      <span className="card-title">Debtor Tracking — Money Lent</span>
                    </div>
                    <button className="btn btn-black btn-sm" onClick={() => setLoanModal(true)}><Plus size={14} />Record Loan</button>
                  </div>
                  {loans.length === 0 ? (
                    <div className="empty-state">No loans recorded. Track money you've lent to others.</div>
                  ) : (
                    <div className="record-list">
                      {loans.map(l => (
                        <div key={l.id} className="record-row">
                          <div className="record-info">
                            <div className={`record-name ${l.isSettled ? 'settled-name' : ''}`}>
                              {l.debtorName}
                              {l.isSettled && <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700 }}>✓ Settled</span>}
                            </div>
                            <div className="record-meta">{l.date}{l.description ? ` · ${l.description}` : ''}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`record-amount ${l.isSettled ? 'amount-muted' : 'amount-amber'}`}>{fmt(Number(l.amount), showBal)}</span>
                            <button className={`settle-pill ${l.isSettled ? 'settled' : ''}`} onClick={() => handleSettleLoan(l.id)}>
                              {l.isSettled ? 'Reopen' : 'Settle'}
                            </button>
                            <button className="btn-ghost danger" onClick={() => handleDeleteLoan(l.id)}><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* BORROWED MONEY */}
                <div className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="card-icon red-icon"><ArrowDownRight size={16} /></div>
                      <span className="card-title">Borrowed Money — You Owe</span>
                    </div>
                    <button className="btn btn-black btn-sm" onClick={() => setBorrowModal(true)}><Plus size={14} />Record</button>
                  </div>
                  {borrowings.length === 0 ? (
                    <div className="empty-state">No borrowings recorded. Track money you owe to others.</div>
                  ) : (
                    <div className="record-list">
                      {borrowings.map(b => (
                        <div key={b.id} className="record-row">
                          <div className="record-info">
                            <div className={`record-name ${b.isSettled ? 'settled-name' : ''}`}>
                              {b.lenderName}
                              {b.isSettled && <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700 }}>✓ Paid</span>}
                            </div>
                            <div className="record-meta">{b.date}{b.description ? ` · ${b.description}` : ''}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`record-amount ${b.isSettled ? 'amount-muted' : 'amount-red'}`}>{fmt(Number(b.amount), showBal)}</span>
                            <button className={`settle-pill ${b.isSettled ? 'settled' : ''}`} onClick={() => handleSettleBorrowing(b.id)}>
                              {b.isSettled ? 'Reopen' : 'Mark Paid'}
                            </button>
                            <button className="btn-ghost danger" onClick={() => handleDeleteBorrowing(b.id)}><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN — LOG FORMS */}
              <div className="right-col">

                {/* LOG INCOME */}
                <div className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="card-icon green-icon"><TrendingUp size={16} /></div>
                      <span className="card-title">Log Income</span>
                    </div>
                  </div>
                  <div className="log-form">
                    {assets.length === 0 ? (
                      <div className="warn-box">Add an asset first before logging income.</div>
                    ) : (
                      <form onSubmit={handleLogIncome} className="form-grid">
                        <div>
                          <label className="form-label">Source / Title *</label>
                          <input placeholder="e.g. Salary, Freelance" value={incomeForm.source} onChange={e => setIncomeForm(p => ({ ...p, source: e.target.value }))} required />
                        </div>
                        <div className="form-row">
                          <div>
                            <label className="form-label">Amount ($) *</label>
                            <input type="number" step="0.01" min="0.01" placeholder="0.00" value={incomeForm.amount} onChange={e => setIncomeForm(p => ({ ...p, amount: e.target.value }))} required />
                          </div>
                          <div>
                            <label className="form-label">Date *</label>
                            <input type="date" value={incomeForm.date} onChange={e => setIncomeForm(p => ({ ...p, date: e.target.value }))} required />
                          </div>
                        </div>
                        <div>
                          <label className="form-label">Destination Asset *</label>
                          <select value={incomeForm.assetId} onChange={e => setIncomeForm(p => ({ ...p, assetId: e.target.value }))} required>
                            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Notes</label>
                          <input placeholder="Optional description" value={incomeForm.description} onChange={e => setIncomeForm(p => ({ ...p, description: e.target.value }))} />
                        </div>
                        <button type="submit" className="btn btn-black btn-full" style={{ background: 'var(--green)', borderColor: 'var(--green)' }}>
                          <TrendingUp size={15} /> Log Credit
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* LOG EXPENSE */}
                <div className="card">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="card-icon red-icon"><TrendingDown size={16} /></div>
                      <span className="card-title">Log Expense</span>
                    </div>
                  </div>
                  <div className="log-form">
                    {assets.length === 0 ? (
                      <div className="warn-box">Add an asset first before logging expenses.</div>
                    ) : (
                      <form onSubmit={handleLogExpense} className="form-grid">
                        <div>
                          <label className="form-label">Expense Title *</label>
                          <input placeholder="e.g. Grocery Shop, Rent" value={expenseForm.title} onChange={e => setExpenseForm(p => ({ ...p, title: e.target.value }))} required />
                        </div>
                        <div className="form-row">
                          <div>
                            <label className="form-label">Amount ($) *</label>
                            <input type="number" step="0.01" min="0.01" placeholder="0.00" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} required />
                          </div>
                          <div>
                            <label className="form-label">Category</label>
                            <select value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}>
                              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="form-row">
                          <div>
                            <label className="form-label">Date *</label>
                            <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))} required />
                          </div>
                          <div>
                            <label className="form-label">Source Asset *</label>
                            <select value={expenseForm.assetId} onChange={e => setExpenseForm(p => ({ ...p, assetId: e.target.value }))} required>
                              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="form-label">Notes</label>
                          <input placeholder="Optional description" value={expenseForm.description} onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))} />
                        </div>
                        <button type="submit" className="btn btn-black btn-full" style={{ background: 'var(--red)', borderColor: 'var(--red)' }}>
                          <TrendingDown size={15} /> Log Debit
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            TAB 2 — ASSET LEDGER
        ══════════════════════════════════════════════════ */}
        {tab === 'ledger' && (
          <>
            <div className="page-header">
              <div>
                <div className="page-eyebrow">Ledger</div>
                <h1 className="page-title">Asset Transaction Ledger</h1>
                <p className="page-sub">View all credits and debits linked to your asset accounts.</p>
              </div>
              <div className="header-btns">
                <button className="toggle-eye" onClick={toggleBal}>{showBal ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                <button className="btn btn-outline" onClick={loadLedger}><RefreshCw size={15} />Refresh</button>
              </div>
            </div>

            {/* Filters */}
            <div className="filter-bar">
              <div className="form-group" style={{ minWidth: 200, flex: '1.5 1 200px' }}>
                <span>Filter by Asset</span>
                <select value={ledgerAsset} onChange={e => setLedgerAsset(e.target.value)}>
                  <option value="all">All Assets</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <span>From Date</span>
                <input type="date" value={ledgerDate.from} onChange={e => setLedgerDate(p => ({ ...p, from: e.target.value }))} />
              </div>
              <div className="form-group">
                <span>To Date</span>
                <input type="date" value={ledgerDate.to} onChange={e => setLedgerDate(p => ({ ...p, to: e.target.value }))} />
              </div>
              <button className="btn btn-black" onClick={loadLedger}><RefreshCw size={15} />Reload</button>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Unified Transactions ({ledgerItems.length})</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title / Source</th>
                        <th>Type</th>
                        <th>Asset Account</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Notes</th>
                        <th className="right-col-cell">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerItems.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>No transactions match the selected filters.</td></tr>
                      ) : ledgerItems.map(it => (
                        <tr key={it.id}>
                          <td style={{ fontWeight: 600 }}>{it.title}</td>
                          <td><span className={`tag tag-${it.type}`}>{it.type === 'credit' ? '↑ Credit' : '↓ Debit'}</span></td>
                          <td><span className={`tag tag-${it.assetType}`}>{it.assetName}</span></td>
                          <td style={{ color: 'var(--text-3)' }}>{it.date}</td>
                          <td className={`strong ${it.type === 'credit' ? 'amount-green' : 'amount-red'}`}>
                            {it.type === 'credit' ? '+' : '−'}{fmt(it.amount, showBal)}
                          </td>
                          <td style={{ color: 'var(--text-3)' }}>{it.description || '—'}</td>
                          <td className="right-col-cell">
                            <button className="btn-ghost danger" onClick={() => handleDeleteLedger(it)}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            TAB 3 — TRANSACTION HISTORY
        ══════════════════════════════════════════════════ */}
        {tab === 'history' && (
          <>
            <div className="page-header">
              <div>
                <div className="page-eyebrow">Analytics</div>
                <h1 className="page-title">Transaction History</h1>
                <p className="page-sub">Expense-only analytics with spending volume and category breakdown.</p>
              </div>
              <div className="header-btns">
                <button className="toggle-eye" onClick={toggleBal}>{showBal ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>

            {/* Filters */}
            <div className="filter-bar">
              <div className="form-group" style={{ flex: '1.5 1 260px' }}>
                <span>Filter Mode</span>
                <div className="seg">
                  {(['day','month','year'] as const).map(f => (
                    <button key={f} className={`seg-btn ${historyFilter === f ? 'active' : ''}`}
                      onClick={() => {
                        setHistoryFilter(f);
                        // reset the selected mode back to defaults when switching
                        if (f === 'day')   setDayRange(defaultRanges.day);
                        if (f === 'month') setMonthRange(defaultRanges.month);
                        if (f === 'year')  setYearRange(defaultRanges.year);
                      }}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {historyFilter === 'day' && (<>
                <div className="form-group">
                  <span>From Day</span>
                  <input type="date" value={dayRange.from}
                    onChange={e => setDayRange(p => ({ ...p, from: e.target.value }))}
                    max={dayRange.to || todayStr()} />
                </div>
                <div className="form-group">
                  <span>To Day</span>
                  <input type="date" value={dayRange.to}
                    onChange={e => setDayRange(p => ({ ...p, to: e.target.value }))}
                    min={dayRange.from} max={todayStr()} />
                </div>
              </>)}
              {historyFilter === 'month' && (<>
                <div className="form-group">
                  <span>From Month</span>
                  <input type="month" value={monthRange.from}
                    onChange={e => setMonthRange(p => ({ ...p, from: e.target.value }))}
                    max={monthRange.to || thisMonth()} />
                </div>
                <div className="form-group">
                  <span>To Month</span>
                  <input type="month" value={monthRange.to}
                    onChange={e => setMonthRange(p => ({ ...p, to: e.target.value }))}
                    min={monthRange.from} max={thisMonth()} />
                </div>
              </>)}
              {historyFilter === 'year' && (<>
                <div className="form-group">
                  <span>From Year</span>
                  <input type="number" min="2000" max={yearRange.to || thisYear()} placeholder="e.g. 2024"
                    value={yearRange.from}
                    onChange={e => setYearRange(p => ({ ...p, from: e.target.value }))} />
                </div>
                <div className="form-group">
                  <span>To Year</span>
                  <input type="number" min={yearRange.from || '2000'} max="2099" placeholder="e.g. 2026"
                    value={yearRange.to}
                    onChange={e => setYearRange(p => ({ ...p, to: e.target.value }))} />
                </div>
              </>)}

              <button className="btn btn-black" onClick={loadHistory}><RefreshCw size={15} />Apply</button>

              {historyData && (
                <div className="filter-total">
                  <div className="filter-total-label">Total Spend</div>
                  <div className="filter-total-value amount-red">{fmt(historyData.totalSpending, showBal)}</div>
                </div>
              )}
            </div>

            {/* Charts */}
            {historyData && (
              <div className="charts-pair">
                {/* Bar chart */}
                <div className="card">
                  <div className="card-header"><span className="card-title">Spending Volume Over Time</span></div>
                  <div className="card-body" style={{ overflow: 'hidden' }}>
                    <div className="chart-wrap h380">
                      <ResponsiveContainer width="100%" height={380}>
                        <BarChart data={historyData.timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="4 4" stroke="#f0f0f0" vertical={false} />
                          <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false}
                            tickFormatter={p => fmtPeriodTick(p, historyFilter)}
                            angle={historyFilter === 'day' ? -35 : 0}
                            textAnchor={historyFilter === 'day' ? 'end' : 'middle'}
                            interval={historyFilter === 'day' ? 'preserveStartEnd' : 0} />
                          <YAxis tick={{ fontSize: 12, fill: '#888' }} axisLine={false} tickLine={false} width={60} tickFormatter={v => `$${v}`} />
                          <Tooltip content={<ChartTooltip visible={showBal} />} />
                          <Bar dataKey="amount" fill="#0a0a0a" radius={[5, 5, 0, 0]} maxBarSize={52} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Pie chart */}
                <div className="card">
                  <div className="card-header"><span className="card-title">Category Breakdown</span></div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
                    <div className="chart-wrap pie-h">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={historyData.categoryBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="amount" nameKey="category">
                            {historyData.categoryBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => showBal ? `$${Number(v).toFixed(2)}` : '••••••'} contentStyle={{ borderRadius: 8, border: '1px solid #e0e0e0' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-legend">
                      {historyData.categoryBreakdown.map((item, i) => (
                        <div key={item.category} className="legend-item">
                          <span className="legend-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span>{item.category}: {showBal ? `${item.percentage}%` : '••%'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="card">
              <div className="card-header"><span className="card-title">Expense Records</span></div>
              <div className="card-body" style={{ padding: 0 }}>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title</th><th>Category</th><th>Asset</th><th>Date</th><th>Amount</th><th>Notes</th><th className="right-col-cell">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!historyData || historyData.transactions.length === 0) ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)' }}>No expenses in this range.</td></tr>
                      ) : historyData.transactions.map(t => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600 }}>{t.title}</td>
                          <td><span className="tag">{t.category}</span></td>
                          <td><span className={`tag tag-${t.asset?.type}`}>{t.asset?.name || '—'}</span></td>
                          <td style={{ color: 'var(--text-3)' }}>{t.date}</td>
                          <td className="strong amount-red">{fmt(Number(t.amount), showBal)}</td>
                          <td style={{ color: 'var(--text-3)' }}>{t.description || '—'}</td>
                          <td className="right-col-cell">
                            <button className="btn-ghost danger" onClick={() => handleDeleteExpense(t.id)}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            TAB 4 — AVERAGES ANALYSIS
        ══════════════════════════════════════════════════ */}
        {tab === 'averages' && (
          <>
            <div className="page-header">
              <div>
                <div className="page-eyebrow">Analytics</div>
                <h1 className="page-title">Averages Analysis</h1>
                <p className="page-sub">Period-over-period spending trends and mean expense calculations.</p>
              </div>
              <div className="header-btns">
                <button className="toggle-eye" onClick={toggleBal}>{showBal ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>

            {/* Filters */}
            <div className="filter-bar">
              <div className="form-group" style={{ flex: '1.5 1 260px' }}>
                <span>Comparison Period</span>
                <div className="seg">
                  {(['day','month','year'] as const).map(f => (
                    <button key={f} className={`seg-btn ${avgFilter === f ? 'active' : ''}`}
                      onClick={() => { setAvgFilter(f); setAvgRange(defaultRanges[f]); }}>
                      {f === 'day' ? 'Daily' : f === 'month' ? 'Monthly' : 'Yearly'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <span>From {avgFilter === 'day' ? 'Date' : avgFilter === 'month' ? 'Month' : 'Year'}</span>
                <input type={avgFilter === 'day' ? 'date' : avgFilter === 'month' ? 'month' : 'number'}
                  placeholder={avgFilter === 'year' ? 'e.g. 2024' : ''}
                  value={avgRange.from}
                  max={avgRange.to || (avgFilter === 'day' ? todayStr() : avgFilter === 'month' ? thisMonth() : thisYear())}
                  onChange={e => setAvgRange(p => ({ ...p, from: e.target.value }))} />
              </div>
              <div className="form-group">
                <span>To {avgFilter === 'day' ? 'Date' : avgFilter === 'month' ? 'Month' : 'Year'}</span>
                <input type={avgFilter === 'day' ? 'date' : avgFilter === 'month' ? 'month' : 'number'}
                  placeholder={avgFilter === 'year' ? 'e.g. 2026' : ''}
                  value={avgRange.to}
                  min={avgRange.from}
                  max={avgFilter === 'day' ? todayStr() : avgFilter === 'month' ? thisMonth() : thisYear()}
                  onChange={e => setAvgRange(p => ({ ...p, to: e.target.value }))} />
              </div>
              <button className="btn btn-black" onClick={loadAverages}><RefreshCw size={15} />Calculate</button>
              {averagesData && (
                <div className="filter-total">
                  <div className="filter-total-label">Mean / {avgFilter}</div>
                  <div className="filter-total-value">{fmt(averagesData.meanValue, showBal)}</div>
                </div>
              )}
            </div>

            {averagesData && (
              <>
                {/* Mean badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div className="mean-badge">
                    <span>Average spend per {avgFilter}</span>
                    <strong>{fmt(averagesData.meanValue, showBal)}</strong>
                  </div>
                </div>

                {/* Big bar chart */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">
                      {avgFilter === 'day' ? 'Daily Spending Trend' : avgFilter === 'month' ? 'Month-over-Month' : 'Year-over-Year'}
                    </span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
                      Mean: <strong style={{ color: 'var(--text)' }}>{fmt(averagesData.meanValue, showBal)}</strong>
                    </span>
                  </div>
                  <div className="card-body" style={{ overflow: 'hidden' }}>
                    <div className="chart-wrap h460">
                      <ResponsiveContainer width="100%" height={460}>
                        <BarChart data={averagesData.periodData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="4 4" stroke="#f0f0f0" vertical={false} />
                          <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false}
                            tickFormatter={p => fmtPeriodTick(p, avgFilter)}
                            angle={avgFilter === 'day' ? -35 : 0}
                            textAnchor={avgFilter === 'day' ? 'end' : 'middle'}
                            interval={avgFilter === 'day' ? 'preserveStartEnd' : 0} />
                          <YAxis tick={{ fontSize: 12, fill: '#888' }} axisLine={false} tickLine={false} width={60} tickFormatter={v => `$${v}`} />
                          <Tooltip content={<ChartTooltip visible={showBal} />} />
                          <Bar dataKey="amount" fill="#444444" radius={[5, 5, 0, 0]} maxBarSize={60} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Info note */}
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-body" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <HelpCircle size={18} color="var(--text-3)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontWeight: 700, marginBottom: 6 }}>About Averages Calculations</p>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.87rem', lineHeight: 1.6 }}>
                    Income is excluded from all calculations. The <strong style={{ color: 'var(--text)' }}>Mean Value</strong> is the total sum divided
                    by the number of periods plotted. Use the date filters to narrow down specific windows of spending.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ══ MODALS ══════════════════════════════════════════ */}

      {/* ADD ASSET */}
      {assetModal && (
        <div className="modal-overlay" onClick={() => setAssetModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setAssetModal(false)}><X size={15} /></button>
            <h2 className="modal-title">Add Asset</h2>
            <form onSubmit={handleCreateAsset} className="form-grid">
              <div>
                <label className="form-label">Asset Name *</label>
                <input placeholder="e.g. Chase Bank, bKash, Cash" value={newAsset.name} onChange={e => setNewAsset(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <label className="form-label">Category</label>
                <select value={newAsset.type} onChange={e => setNewAsset(p => ({ ...p, type: e.target.value as Asset['type'] }))}>
                  <option value="bank">Bank</option>
                  <option value="wallet">Digital Wallet</option>
                  <option value="on_hand">On Hand</option>
                </select>
              </div>
              <div>
                <label className="form-label">Initial Balance ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={newAsset.balance || ''} onChange={e => setNewAsset(p => ({ ...p, balance: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setAssetModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-black">Create Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD LOAN */}
      {loanModal && (
        <div className="modal-overlay" onClick={() => setLoanModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setLoanModal(false)}><X size={15} /></button>
            <h2 className="modal-title" style={{ color: 'var(--amber)' }}>Record Money Lent</h2>
            <form onSubmit={handleCreateLoan} className="form-grid">
              <div>
                <label className="form-label">Debtor's Name *</label>
                <input placeholder="Who owes you money?" value={newLoan.debtorName} onChange={e => setNewLoan(p => ({ ...p, debtorName: e.target.value }))} required />
              </div>
              <div className="form-row">
                <div>
                  <label className="form-label">Amount Lent ($) *</label>
                  <input type="number" step="0.01" min="0.01" placeholder="0.00" value={newLoan.amount || ''} onChange={e => setNewLoan(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} required />
                </div>
                <div>
                  <label className="form-label">Date Given *</label>
                  <input type="date" value={newLoan.date} onChange={e => setNewLoan(p => ({ ...p, date: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input placeholder="Optional context" value={newLoan.description} onChange={e => setNewLoan(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setLoanModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-black" style={{ background: 'var(--amber)', borderColor: 'var(--amber)' }}>Record Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD BORROWING */}
      {borrowModal && (
        <div className="modal-overlay" onClick={() => setBorrowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setBorrowModal(false)}><X size={15} /></button>
            <h2 className="modal-title" style={{ color: 'var(--red)' }}>Record Money Borrowed</h2>
            <form onSubmit={handleCreateBorrowing} className="form-grid">
              <div>
                <label className="form-label">Lender's Name *</label>
                <input placeholder="Who did you borrow from?" value={newBorrowing.lenderName} onChange={e => setNewBorrowing(p => ({ ...p, lenderName: e.target.value }))} required />
              </div>
              <div className="form-row">
                <div>
                  <label className="form-label">Amount Borrowed ($) *</label>
                  <input type="number" step="0.01" min="0.01" placeholder="0.00" value={newBorrowing.amount || ''} onChange={e => setNewBorrowing(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} required />
                </div>
                <div>
                  <label className="form-label">Date Taken *</label>
                  <input type="date" value={newBorrowing.date} onChange={e => setNewBorrowing(p => ({ ...p, date: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input placeholder="Optional context" value={newBorrowing.description} onChange={e => setNewBorrowing(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setBorrowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-black" style={{ background: 'var(--red)', borderColor: 'var(--red)' }}>Record Debt</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
