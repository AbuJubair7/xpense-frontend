import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coins,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Settings2,
  TrendingDown,
  TrendingUp,
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, setAuthToken } from './api';
import { useStore } from './store';
import type { Asset } from './api';

type Page = 'dashboard' | 'activity' | 'accounts' | 'debts' | 'insights' | 'profile';
type Modal = 'asset' | 'income' | 'expense' | 'loan' | 'borrowing' | null;
type InsightMode = 'history' | 'averages';

const CATEGORIES = ['Food', 'Rent', 'Shopping', 'Travel', 'Utilities', 'Others'];
const PIE_COLORS = ['#0e7a3c', '#1e5eff', '#d97706', '#7c3aed', '#db2777', '#475569'];

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const daysAgo = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const monthsAgo = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 7);
};
const thisYear = () => String(new Date().getFullYear());
const lastYear = () => String(new Date().getFullYear() - 1);

const defaultRanges = {
  day: { from: daysAgo(30), to: today() },
  month: { from: monthsAgo(5), to: thisMonth() },
  year: { from: lastYear(), to: thisYear() },
};

function formatMoney(value: number, visible: boolean, compact = false) {
  if (!visible) return '••••••';
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTick(period: string, mode: string) {
  if (mode === 'day') return new Date(`${period}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (mode === 'month') {
    const [year, month] = period.split('-');
    return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return period;
}

function assetLabel(type: Asset['type']) {
  return type === 'bank' ? 'Bank account' : type === 'wallet' ? 'Digital wallet' : 'Cash on hand';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function AssetIcon({ type, size = 17 }: { type: Asset['type']; size?: number }) {
  if (type === 'bank') return <Landmark size={size} aria-hidden="true" />;
  if (type === 'wallet') return <Wallet size={size} aria-hidden="true" />;
  return <Coins size={size} aria-hidden="true" />;
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function EmptyState({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{copy}</p>
      {action}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ChartTooltip({ active, payload, label, visible }: { active?: boolean; payload?: { value: number }[]; label?: string; visible: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      <strong>{formatMoney(Number(payload[0].value), visible)}</strong>
    </div>
  );
}

export default function App() {
  const {
    currentUser, loading, error,
    assets, loans, borrowings, incomes, expenses,
    historyData, averagesData,
    setCurrentUser, setLoading, setError,
    loadOverview, loadHistory, loadAverages, logout
  } = useStore();

  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirm, setAuthConfirm] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  const [page, setPage] = useState<Page>('dashboard');
  const [showBalances, setShowBalances] = useState(() => localStorage.getItem('showBalances') !== 'false');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [modal, setModal] = useState<Modal>(null);
  const [assetDraft, setAssetDraft] = useState({ id: '', name: '', type: 'bank' as Asset['type'], balance: '' });
  const [incomeDraft, setIncomeDraft] = useState({ source: '', amount: '', date: today(), description: '', assetId: '' });
  const [expenseDraft, setExpenseDraft] = useState({ title: '', amount: '', category: 'Food', date: today(), description: '', assetId: '' });
  const [loanDraft, setLoanDraft] = useState({ debtorName: '', amount: '', date: today(), description: '' });
  const [borrowingDraft, setBorrowingDraft] = useState({ lenderName: '', amount: '', date: today(), description: '' });

  const [activityType, setActivityType] = useState<'all' | 'credit' | 'debit'>('all');
  const [activityAsset, setActivityAsset] = useState('all');
  const [activityDates, setActivityDates] = useState({ from: '', to: '' });

  const [insightMode, setInsightMode] = useState<InsightMode>('history');
  const [historyFilter, setHistoryFilter] = useState<'day' | 'month' | 'year'>('month');
  const [dayRange, setDayRange] = useState(defaultRanges.day);
  const [monthRange, setMonthRange] = useState(defaultRanges.month);
  const [yearRange, setYearRange] = useState(defaultRanges.year);
  const [averageFilter, setAverageFilter] = useState<'day' | 'month' | 'year'>('month');
  const [averageRange, setAverageRange] = useState(defaultRanges.month);

  const [profileName, setProfileName] = useState(() => localStorage.getItem('profileName') || currentUser?.name || '');
  const [profileMessage, setProfileMessage] = useState('');

  const handleLoadHistory = useCallback(async () => {
    const params = historyFilter === 'day'
      ? { fromDay: dayRange.from, toDay: dayRange.to }
      : historyFilter === 'month'
        ? { fromMonth: monthRange.from, toMonth: monthRange.to }
        : { fromYear: yearRange.from, toYear: yearRange.to };
    await loadHistory(params);
  }, [dayRange, historyFilter, loadHistory, monthRange, yearRange]);

  const handleLoadAverages = useCallback(async () => {
    await loadAverages({ type: averageFilter, fromDate: averageRange.from, toDate: averageRange.to });
  }, [averageFilter, averageRange, loadAverages]);

  useEffect(() => {
    const requestId = window.setTimeout(() => { void loadOverview(); }, 0);
    return () => window.clearTimeout(requestId);
  }, [loadOverview, currentUser]);

  useEffect(() => {
    if (page !== 'insights') return undefined;
    const requestId = window.setTimeout(() => {
      if (insightMode === 'history') void handleLoadHistory();
      else void handleLoadAverages();
    }, 0);
    return () => window.clearTimeout(requestId);
  }, [insightMode, handleLoadAverages, handleLoadHistory, page]);

  const toggleBalances = () => {
    const next = !showBalances;
    setShowBalances(next);
    localStorage.setItem('showBalances', String(next));
  };

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.login({ email: authEmail, passwordPlain: authPassword });
      setAuthToken(result.access_token);
      localStorage.setItem('user', JSON.stringify(result.user));
      setCurrentUser(result.user);
      setProfileName(localStorage.getItem('profileName') || result.user.name);
      setAuthPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setAuthMessage('');
    if (authPassword !== authConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.register({ name: authName, email: authEmail, passwordPlain: authPassword });
      setAuthTab('login');
      setAuthMessage('Account created. Sign in to open your workspace.');
      setAuthPassword('');
      setAuthConfirm('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setPage('dashboard');
    setAuthMessage('');
  };

  const closeModal = () => setModal(null);

  const openNewAsset = () => {
    setAssetDraft({ id: '', name: '', type: 'bank', balance: '' });
    setModal('asset');
  };

  const openEditAsset = (asset: Asset) => {
    setAssetDraft({ id: asset.id, name: asset.name, type: asset.type, balance: String(asset.balance) });
    setModal('asset');
  };

  const handleAsset = async (event: FormEvent) => {
    event.preventDefault();
    const balance = Number(assetDraft.balance);
    if (!assetDraft.name.trim() || Number.isNaN(balance) || balance < 0) {
      setError('Enter an account name and a valid non-negative balance.');
      return;
    }
    try {
      if (assetDraft.id) await api.updateAsset(assetDraft.id, { name: assetDraft.name.trim(), type: assetDraft.type, balance });
      else await api.createAsset({ name: assetDraft.name.trim(), type: assetDraft.type, balance });
      closeModal();
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save account.');
    }
  };

  const handleDeleteAsset = async () => {
    if (!assetDraft.id || !confirm('Delete this account? This cannot be undone.')) return;
    try {
      await api.deleteAsset(assetDraft.id);
      closeModal();
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete account.');
    }
  };

  const handleIncome = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(incomeDraft.amount);
    const assetId = incomeDraft.assetId || assets[0]?.id || '';
    if (!incomeDraft.source.trim() || !assetId || !amount || amount < 0) {
      setError('Complete the required income fields.');
      return;
    }
    try {
      await api.createIncome({ ...incomeDraft, source: incomeDraft.source.trim(), amount, assetId });
      setIncomeDraft((draft) => ({ ...draft, source: '', amount: '', date: today(), description: '' }));
      closeModal();
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add income.');
    }
  };

  const handleExpense = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(expenseDraft.amount);
    const assetId = expenseDraft.assetId || assets[0]?.id || '';
    if (!expenseDraft.title.trim() || !assetId || !amount || amount < 0) {
      setError('Complete the required expense fields.');
      return;
    }
    try {
      await api.createExpense({ ...expenseDraft, title: expenseDraft.title.trim(), amount, assetId });
      setExpenseDraft((draft) => ({ ...draft, title: '', amount: '', date: today(), description: '' }));
      closeModal();
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add expense.');
    }
  };

  const handleLoan = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(loanDraft.amount);
    if (!loanDraft.debtorName.trim() || !amount || amount < 0) {
      setError('Complete the required loan fields.');
      return;
    }
    try {
      await api.createLoan({ ...loanDraft, debtorName: loanDraft.debtorName.trim(), amount });
      setLoanDraft({ debtorName: '', amount: '', date: today(), description: '' });
      closeModal();
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add loan.');
    }
  };

  const handleBorrowing = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(borrowingDraft.amount);
    if (!borrowingDraft.lenderName.trim() || !amount || amount < 0) {
      setError('Complete the required borrowing fields.');
      return;
    }
    try {
      await api.createBorrowing({ ...borrowingDraft, lenderName: borrowingDraft.lenderName.trim(), amount });
      setBorrowingDraft({ lenderName: '', amount: '', date: today(), description: '' });
      closeModal();
      await loadOverview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add borrowing.');
    }
  };

  const settleLoan = async (id: string) => {
    try { await api.settleLoan(id); await loadOverview(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to update loan.'); }
  };

  const settleBorrowing = async (id: string) => {
    try { await api.settleBorrowing(id); await loadOverview(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to update borrowing.'); }
  };

  const deleteLoan = async (id: string) => {
    if (!confirm('Delete this loan?')) return;
    try { await api.deleteLoan(id); await loadOverview(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to delete loan.'); }
  };

  const deleteBorrowing = async (id: string) => {
    if (!confirm('Delete this borrowing?')) return;
    try { await api.deleteBorrowing(id); await loadOverview(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to delete borrowing.'); }
  };

  const deleteActivity = async (id: string, kind: 'credit' | 'debit') => {
    if (!confirm(`Delete this ${kind === 'credit' ? 'income' : 'expense'} entry?`)) return;
    try {
      if (kind === 'credit') await api.deleteIncome(id);
      else await api.deleteExpense(id);
      await loadOverview();
      if (page === 'insights' && insightMode === 'history') await handleLoadHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete transaction.');
    }
  };

  const deleteExpenseFromHistory = async (id: string) => {
    if (!confirm('Delete this expense entry?')) return;
    try { await api.deleteExpense(id); await Promise.all([loadOverview(), handleLoadHistory()]); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to delete expense.'); }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser) return;
    const nextName = profileName.trim();
    if (!nextName) {
      setProfileMessage('Your display name cannot be empty.');
      return;
    }
    try {
      const updatedUser = await api.updateProfile({ name: nextName });
      setCurrentUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setProfileMessage('Profile updated successfully.');
    } catch (e: any) {
      setProfileMessage(e.message || 'Failed to update profile.');
    }
  };

  const totalAssets = useMemo(() => assets.reduce((sum, asset) => sum + Number(asset.balance), 0), [assets]);
  const outstandingLoans = useMemo(() => loans.reduce((sum, loan) => sum + (loan.isSettled ? 0 : Number(loan.amount)), 0), [loans]);
  const outstandingBorrowings = useMemo(() => borrowings.reduce((sum, borrowing) => sum + (borrowing.isSettled ? 0 : Number(borrowing.amount)), 0), [borrowings]);
  const netWorth = totalAssets + outstandingLoans - outstandingBorrowings;
  const periodIncome = useMemo(() => incomes.filter((income) => income.date.startsWith(thisMonth())).reduce((sum, income) => sum + Number(income.amount), 0), [incomes]);
  const periodExpenses = useMemo(() => expenses.filter((expense) => expense.date.startsWith(thisMonth())).reduce((sum, expense) => sum + Number(expense.amount), 0), [expenses]);

  const activityItems = useMemo(() => [
    ...incomes.map((income) => ({
      id: income.id, kind: 'credit' as const, title: income.source, amount: Number(income.amount), date: income.date,
      description: income.description || '', assetName: income.asset?.name || 'Unknown account', assetType: income.asset?.type || 'bank', assetId: income.asset?.id || '',
    })),
    ...expenses.map((expense) => ({
      id: expense.id, kind: 'debit' as const, title: expense.title, amount: Number(expense.amount), date: expense.date,
      description: expense.description || '', assetName: expense.asset?.name || 'Unknown account', assetType: expense.asset?.type || 'bank', assetId: expense.asset?.id || '',
    })),
  ].filter((item) => {
    if (activityType !== 'all' && item.kind !== activityType) return false;
    if (activityAsset !== 'all' && item.assetId !== activityAsset) return false;
    if (activityDates.from && item.date < activityDates.from) return false;
    if (activityDates.to && item.date > activityDates.to) return false;
    return true;
  }).sort((first, second) => second.date.localeCompare(first.date)), [activityAsset, activityDates, activityType, expenses, incomes]);

  const recentActivity = activityItems.slice(0, 5);
  const navItems: { id: Page; label: string; shortLabel: string; icon: ReactNode }[] = [
    { id: 'dashboard', label: 'Overview', shortLabel: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'activity', label: 'Activity', shortLabel: 'Activity', icon: <Receipt size={18} /> },
    { id: 'accounts', label: 'Accounts', shortLabel: 'Accounts', icon: <Landmark size={18} /> },
    { id: 'debts', label: 'Debt book', shortLabel: 'Debts', icon: <CircleDollarSign size={18} /> },
    { id: 'insights', label: 'Insights', shortLabel: 'Insights', icon: <BarChart3 size={18} /> },
    { id: 'profile', label: 'Profile & settings', shortLabel: 'Profile', icon: <UserRound size={18} /> },
  ];

  const goToPage = (nextPage: Page) => {
    setPage(nextPage);
    setMobileNavOpen(false);
  };

  if (!currentUser) {
    return (
      <main className="auth-layout">
        <section className="auth-brief" aria-hidden="true">
          <div className="brand brand-light"><span className="brand-mark">X</span><span>xpense</span></div>
          <div className="auth-brief-copy">
            <p className="eyebrow">A calmer way to manage money</p>
            <h1>See the whole picture, then make the next move.</h1>
            <p>Accounts, daily activity, debts, and focused spending insight in one clear workspace.</p>
          </div>
          <div className="auth-brief-points">
            <span><Check size={16} /> Account-based transaction tracking</span>
            <span><Check size={16} /> Private, balance-aware dashboards</span>
            <span><Check size={16} /> Spending and average analysis</span>
          </div>
        </section>
        <section className="auth-panel">
          <div className="auth-card">
            <div className="brand brand-dark"><span className="brand-mark">X</span><span>xpense</span></div>
            <p className="eyebrow">Your finance workspace</p>
            <h2>{authTab === 'login' ? 'Welcome back' : 'Set up your workspace'}</h2>
            <p className="auth-copy">{authTab === 'login' ? 'Sign in to continue where you left off.' : 'Create a secure account to start tracking clearly.'}</p>

            {error && <div className="notice notice-error"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={16} /></button></div>}
            {authMessage && <div className="notice notice-success">{authMessage}</div>}

            <div className="segmented-control auth-tabs">
              <button className={authTab === 'login' ? 'active' : ''} type="button" onClick={() => { setAuthTab('login'); setError(null); }}>Sign in</button>
              <button className={authTab === 'register' ? 'active' : ''} type="button" onClick={() => { setAuthTab('register'); setError(null); }}>Create account</button>
            </div>

            <form className="auth-form" onSubmit={authTab === 'login' ? handleLogin : handleRegister}>
              {authTab === 'register' && <label>Full name<input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" required /></label>}
              <label>Email address<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" required /></label>
              <label>Password<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="••••••••" minLength={6} required /></label>
              {authTab === 'register' && <label>Confirm password<input type="password" value={authConfirm} onChange={(event) => setAuthConfirm(event.target.value)} placeholder="••••••••" minLength={6} required /></label>}
              <button className="button button-primary button-full" type="submit" disabled={loading}>
                {loading ? <RefreshCw className="spin" size={17} /> : authTab === 'login' ? 'Sign in to xpense' : 'Create workspace'}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      <header className="mobile-header">
        <div className="brand brand-light"><span className="brand-mark">X</span><span>xpense</span></div>
        <div className="mobile-header-actions">
          <button className="icon-button icon-button-dark" type="button" onClick={toggleBalances} aria-label={showBalances ? 'Hide balances' : 'Show balances'}>{showBalances ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          <button className="icon-button icon-button-dark" type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Open navigation"><Menu size={20} /></button>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="mobile-navigation">
          <div className="mobile-navigation-card">
            <div className="mobile-user"><span className="avatar">{currentUser.name.charAt(0).toUpperCase()}</span><div><strong>{currentUser.name}</strong><span>{currentUser.email}</span></div></div>
            {navItems.map((item) => <button key={item.id} className={`mobile-nav-button ${page === item.id ? 'active' : ''}`} type="button" onClick={() => goToPage(item.id)}>{item.icon}<span>{item.label}</span></button>)}
            <button className="mobile-nav-button signout" type="button" onClick={handleLogout}><LogOut size={18} /><span>Sign out</span></button>
          </div>
        </div>
      )}

      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand brand-light"><span className="brand-mark">X</span><span className="sidebar-copy">xpense</span></div>
          <button className="sidebar-collapse" type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
        <button className="sidebar-user" type="button" onClick={() => goToPage('profile')}>
          <span className="avatar">{currentUser.name.charAt(0).toUpperCase()}</span>
          <span className="sidebar-user-copy"><strong>{currentUser.name}</strong><small>{currentUser.email}</small></span>
        </button>
        <p className="sidebar-section-label">Workspace</p>
        <nav className="sidebar-navigation" aria-label="Main navigation">
          {navItems.slice(0, 5).map((item) => <button key={item.id} className={`nav-button ${page === item.id ? 'active' : ''}`} type="button" onClick={() => goToPage(item.id)} title={sidebarCollapsed ? item.label : undefined}>{item.icon}<span className="sidebar-copy">{item.label}</span></button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-button ${page === 'profile' ? 'active' : ''}`} type="button" onClick={() => goToPage('profile')} title={sidebarCollapsed ? 'Profile & settings' : undefined}><Settings2 size={18} /><span className="sidebar-copy">Profile & settings</span></button>
          <button className="nav-button nav-signout" type="button" onClick={handleLogout} title={sidebarCollapsed ? 'Sign out' : undefined}><LogOut size={18} /><span className="sidebar-copy">Sign out</span></button>
        </div>
      </aside>

      <main className="main-content" aria-busy={loading}>
        {error && <div className="notice notice-error app-notice"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={16} /></button></div>}

        {page === 'dashboard' && (
          <>
            <PageHeader eyebrow="Financial overview" title={`${greeting()}, ${currentUser.name.split(' ')[0]}`} description="A single, focused view of the money you have, owe, and are moving this month." actions={<><button className="icon-button" type="button" onClick={toggleBalances} aria-label={showBalances ? 'Hide balances' : 'Show balances'}>{showBalances ? <EyeOff size={18} /> : <Eye size={18} />}</button><button className="button button-secondary" type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} />Refresh</button></>} />

            <section className="balance-hero">
              <div className="balance-hero-copy"><span className="hero-label">Estimated net worth</span><strong>{formatMoney(netWorth, showBalances)}</strong><p><span className="positive-dot" /> Updated from your accounts and outstanding debt</p></div>
              <div className="hero-divider" />
              <div className="balance-hero-metrics"><div><span>Available assets</span><strong>{formatMoney(totalAssets, showBalances, true)}</strong></div><div><span>Monthly net flow</span><strong className={periodIncome - periodExpenses >= 0 ? 'amount-positive' : 'amount-negative'}>{formatMoney(periodIncome - periodExpenses, showBalances, true)}</strong></div></div>
              <div className="hero-actions"><button className="button button-light" type="button" onClick={() => setModal('income')}><TrendingUp size={16} />Add income</button><button className="button button-ghost-light" type="button" onClick={() => setModal('expense')}><TrendingDown size={16} />Add expense</button></div>
            </section>

            <section className="metric-grid">
              <article className="metric-card"><div className="metric-icon"><Landmark size={18} /></div><span>Accounts</span><strong>{formatMoney(totalAssets, showBalances)}</strong><p>{assets.length} tracked account{assets.length === 1 ? '' : 's'}</p></article>
              <article className="metric-card"><div className="metric-icon metric-icon-amber"><ArrowUpRight size={18} /></div><span>Money owed to you</span><strong>{formatMoney(outstandingLoans, showBalances)}</strong><p>{loans.filter((loan) => !loan.isSettled).length} open loan{loans.filter((loan) => !loan.isSettled).length === 1 ? '' : 's'}</p></article>
              <article className="metric-card"><div className="metric-icon metric-icon-red"><ArrowDownRight size={18} /></div><span>Money you owe</span><strong>{formatMoney(outstandingBorrowings, showBalances)}</strong><p>{borrowings.filter((borrowing) => !borrowing.isSettled).length} open borrowing{borrowings.filter((borrowing) => !borrowing.isSettled).length === 1 ? '' : 's'}</p></article>
              <article className="metric-card"><div className="metric-icon metric-icon-green"><CalendarDays size={18} /></div><span>Spent this month</span><strong>{formatMoney(periodExpenses, showBalances)}</strong><p>{formatMoney(periodIncome, showBalances, true)} received</p></article>
            </section>

            <section className="dashboard-grid">
              <article className="panel span-two">
                <div className="panel-header"><div><p className="panel-kicker">Cash position</p><h2>Accounts at a glance</h2></div><button className="text-button" type="button" onClick={() => goToPage('accounts')}>Manage accounts <ChevronRight size={16} /></button></div>
                {assets.length ? <div className="account-summary-list">{assets.slice(0, 4).map((asset) => <div className="account-summary-row" key={asset.id}><div className={`account-icon account-icon-${asset.type}`}><AssetIcon type={asset.type} /></div><div><strong>{asset.name}</strong><span>{assetLabel(asset.type)}</span></div><strong className="account-summary-balance">{formatMoney(Number(asset.balance), showBalances)}</strong></div>)}</div> : <EmptyState icon={<Landmark size={22} />} title="Start with an account" copy="Add a bank account, wallet, or cash balance to ground your dashboard." action={<button className="button button-primary button-small" type="button" onClick={openNewAsset}><Plus size={15} />Add account</button>} />}
              </article>
              <article className="panel cash-flow-panel"><div className="panel-header"><div><p className="panel-kicker">This month</p><h2>Cash flow</h2></div><CalendarDays size={19} /></div><div className="cash-flow-total"><span>Net movement</span><strong className={periodIncome - periodExpenses >= 0 ? 'amount-positive' : 'amount-negative'}>{formatMoney(periodIncome - periodExpenses, showBalances)}</strong></div><div className="flow-row"><span><i className="flow-dot flow-dot-income" />Income</span><strong>{formatMoney(periodIncome, showBalances)}</strong></div><div className="flow-row"><span><i className="flow-dot flow-dot-expense" />Expenses</span><strong>{formatMoney(periodExpenses, showBalances)}</strong></div></article>
              <article className="panel span-two"><div className="panel-header"><div><p className="panel-kicker">Latest movement</p><h2>Recent activity</h2></div><button className="text-button" type="button" onClick={() => goToPage('activity')}>All activity <ChevronRight size={16} /></button></div>{recentActivity.length ? <div className="activity-list">{recentActivity.map((item) => <div className="activity-row" key={`${item.kind}-${item.id}`}><div className={`transaction-icon ${item.kind}`} aria-hidden="true">{item.kind === 'credit' ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</div><div className="activity-copy"><strong>{item.title}</strong><span>{item.assetName} · {formatDate(item.date)}</span></div><strong className={item.kind === 'credit' ? 'amount-positive' : 'amount-negative'}>{item.kind === 'credit' ? '+' : '−'}{formatMoney(item.amount, showBalances)}</strong></div>)}</div> : <EmptyState icon={<Receipt size={22} />} title="No activity yet" copy="Income and expense records will appear here as you add them." action={<button className="button button-secondary button-small" type="button" onClick={() => setModal('expense')}><Plus size={15} />Add an entry</button>} />}</article>
              <article className="panel debt-pulse"><div className="panel-header"><div><p className="panel-kicker">Debt pulse</p><h2>Keep obligations clear</h2></div><CircleDollarSign size={19} /></div><div className="debt-pulse-row"><span>To collect</span><strong>{formatMoney(outstandingLoans, showBalances)}</strong></div><div className="debt-pulse-row"><span>To repay</span><strong>{formatMoney(outstandingBorrowings, showBalances)}</strong></div><button className="button button-secondary button-small button-full" type="button" onClick={() => goToPage('debts')}>Open debt book</button></article>
            </section>
          </>
        )}

        {page === 'activity' && (
          <>
            <PageHeader eyebrow="Transactions" title="Money in, money out" description="Capture activity against the account it belongs to, then find it quickly when you need it." actions={<><button className="button button-secondary" type="button" onClick={() => setModal('income')}><Plus size={16} />Income</button><button className="button button-primary" type="button" onClick={() => setModal('expense')}><Plus size={16} />Expense</button></>} />
            <section className="filter-panel"><div className="filter-label"><ListFilter size={17} /><span>Filter activity</span></div><div className="segmented-control"><button className={activityType === 'all' ? 'active' : ''} type="button" onClick={() => setActivityType('all')}>All</button><button className={activityType === 'credit' ? 'active' : ''} type="button" onClick={() => setActivityType('credit')}>Income</button><button className={activityType === 'debit' ? 'active' : ''} type="button" onClick={() => setActivityType('debit')}>Expenses</button></div><label className="filter-field"><span>Account</span><select value={activityAsset} onChange={(event) => setActivityAsset(event.target.value)}><option value="all">All accounts</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label className="filter-field"><span>From</span><input type="date" value={activityDates.from} onChange={(event) => setActivityDates((range) => ({ ...range, from: event.target.value }))} /></label><label className="filter-field"><span>To</span><input type="date" value={activityDates.to} onChange={(event) => setActivityDates((range) => ({ ...range, to: event.target.value }))} /></label></section>
            <section className="panel table-panel"><div className="panel-header"><div><p className="panel-kicker">Ledger</p><h2>{activityItems.length} matching transaction{activityItems.length === 1 ? '' : 's'}</h2></div><button className="icon-button" type="button" onClick={() => void loadOverview()} aria-label="Refresh activity"><RefreshCw className={loading ? 'spin' : ''} size={17} /></button></div>{activityItems.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Transaction</th><th>Account</th><th>Date</th><th>Notes</th><th className="align-right">Amount</th><th aria-label="Actions" /></tr></thead><tbody>{activityItems.map((item) => <tr key={`${item.kind}-${item.id}`}><td><div className="transaction-cell"><span className={`transaction-icon ${item.kind}`}>{item.kind === 'credit' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</span><div><strong>{item.title}</strong><small>{item.kind === 'credit' ? 'Income' : 'Expense'}</small></div></div></td><td><span className="account-table-cell"><AssetIcon type={item.assetType} size={15} />{item.assetName}</span></td><td>{formatDate(item.date)}</td><td className="muted-cell">{item.description || '—'}</td><td className={`align-right amount-cell ${item.kind === 'credit' ? 'amount-positive' : 'amount-negative'}`}>{item.kind === 'credit' ? '+' : '−'}{formatMoney(item.amount, showBalances)}</td><td><button className="icon-button danger-button" type="button" onClick={() => void deleteActivity(item.id, item.kind)} aria-label={`Delete ${item.title}`}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={<Receipt size={22} />} title="Nothing matches these filters" copy="Try a different account or date range, or record a new transaction." />}</section>
          </>
        )}

        {page === 'accounts' && (
          <>
            <PageHeader eyebrow="Accounts" title="Your money, organised" description="Keep bank, wallet, and cash balances separate so every transaction has a clear home." actions={<button className="button button-primary" type="button" onClick={openNewAsset}><Plus size={16} />Add account</button>} />
            <section className="accounts-summary"><div><span>Available across all accounts</span><strong>{formatMoney(totalAssets, showBalances)}</strong></div><p><Building2 size={18} /> {assets.length} account{assets.length === 1 ? '' : 's'} connected to your workspace</p></section>
            {assets.length ? <section className="account-grid">{assets.map((asset) => <article className={`account-card account-card-${asset.type}`} key={asset.id}><div className="account-card-top"><div className={`account-icon account-icon-${asset.type}`}><AssetIcon type={asset.type} size={19} /></div><button className="icon-button" type="button" onClick={() => openEditAsset(asset)} aria-label={`Edit ${asset.name}`}><MoreHorizontal size={19} /></button></div><p>{assetLabel(asset.type)}</p><h2>{asset.name}</h2><strong>{formatMoney(Number(asset.balance), showBalances)}</strong><footer><span>Updated {formatDate(asset.updatedAt)}</span><button className="text-button" type="button" onClick={() => openEditAsset(asset)}><Pencil size={14} />Edit</button></footer></article>)}</section> : <section className="panel"><EmptyState icon={<Landmark size={23} />} title="Add your first account" copy="A bank account, wallet, or cash balance makes the rest of your workspace useful." action={<button className="button button-primary" type="button" onClick={openNewAsset}><Plus size={16} />Add account</button>} /></section>}
            <section className="panel account-guide"><div className="guide-icon"><CreditCard size={18} /></div><div><h2>Keep balances trustworthy</h2><p>Use an account’s edit action after reconciling a statement or correcting a cash balance. Income and expenses update their selected account automatically.</p></div></section>
          </>
        )}

        {page === 'debts' && (
          <>
            <PageHeader eyebrow="Debt book" title="Know what is outstanding" description="Keep money you have lent and money you owe distinct, visible, and easy to settle." actions={<><button className="button button-secondary" type="button" onClick={() => setModal('loan')}><Plus size={16} />Money lent</button><button className="button button-primary" type="button" onClick={() => setModal('borrowing')}><Plus size={16} />Money borrowed</button></>} />
            <section className="debt-summary-grid"><article className="debt-summary debt-summary-lent"><span>Outstanding to collect</span><strong>{formatMoney(outstandingLoans, showBalances)}</strong><p>{loans.filter((loan) => !loan.isSettled).length} active loan{loans.filter((loan) => !loan.isSettled).length === 1 ? '' : 's'}</p></article><article className="debt-summary debt-summary-borrowed"><span>Outstanding to repay</span><strong>{formatMoney(outstandingBorrowings, showBalances)}</strong><p>{borrowings.filter((borrowing) => !borrowing.isSettled).length} active borrowing{borrowings.filter((borrowing) => !borrowing.isSettled).length === 1 ? '' : 's'}</p></article></section>
            <section className="debt-grid"><article className="panel debt-panel"><div className="panel-header"><div><p className="panel-kicker">Receivable</p><h2>Money you lent</h2></div><button className="icon-button" type="button" onClick={() => setModal('loan')} aria-label="Record money lent"><Plus size={18} /></button></div>{loans.length ? <div className="debt-list">{loans.map((loan) => <div className="debt-row" key={loan.id}><div className="debt-person"><span className="person-avatar">{loan.debtorName.charAt(0).toUpperCase()}</span><div><strong>{loan.debtorName}</strong><span>{formatDate(loan.date)}{loan.description ? ` · ${loan.description}` : ''}</span></div></div><div className="debt-row-actions"><strong className={loan.isSettled ? 'amount-muted' : 'amount-amber'}>{formatMoney(Number(loan.amount), showBalances)}</strong><button className={`status-button ${loan.isSettled ? 'is-settled' : ''}`} type="button" onClick={() => void settleLoan(loan.id)}>{loan.isSettled ? <><Check size={14} />Settled</> : 'Settle'}</button><button className="icon-button danger-button" type="button" onClick={() => void deleteLoan(loan.id)} aria-label={`Delete loan for ${loan.debtorName}`}><Trash2 size={16} /></button></div></div>)}</div> : <EmptyState icon={<ArrowUpRight size={22} />} title="No loans recorded" copy="Record money you lend to make follow-up simple." action={<button className="button button-secondary button-small" type="button" onClick={() => setModal('loan')}><Plus size={15} />Record loan</button>} />}</article>
              <article className="panel debt-panel"><div className="panel-header"><div><p className="panel-kicker">Payable</p><h2>Money you borrowed</h2></div><button className="icon-button" type="button" onClick={() => setModal('borrowing')} aria-label="Record money borrowed"><Plus size={18} /></button></div>{borrowings.length ? <div className="debt-list">{borrowings.map((borrowing) => <div className="debt-row" key={borrowing.id}><div className="debt-person"><span className="person-avatar person-avatar-red">{borrowing.lenderName.charAt(0).toUpperCase()}</span><div><strong>{borrowing.lenderName}</strong><span>{formatDate(borrowing.date)}{borrowing.description ? ` · ${borrowing.description}` : ''}</span></div></div><div className="debt-row-actions"><strong className={borrowing.isSettled ? 'amount-muted' : 'amount-negative'}>{formatMoney(Number(borrowing.amount), showBalances)}</strong><button className={`status-button ${borrowing.isSettled ? 'is-settled' : ''}`} type="button" onClick={() => void settleBorrowing(borrowing.id)}>{borrowing.isSettled ? <><Check size={14} />Paid</> : 'Mark paid'}</button><button className="icon-button danger-button" type="button" onClick={() => void deleteBorrowing(borrowing.id)} aria-label={`Delete borrowing from ${borrowing.lenderName}`}><Trash2 size={16} /></button></div></div>)}</div> : <EmptyState icon={<ArrowDownRight size={22} />} title="No borrowings recorded" copy="Record money you owe so repayment never gets lost." action={<button className="button button-primary button-small" type="button" onClick={() => setModal('borrowing')}><Plus size={15} />Record borrowing</button>} />}</article></section>
          </>
        )}

        {page === 'insights' && (
          <>
            <PageHeader eyebrow="Insights" title="Understand your spending rhythm" description="Explore the volume and shape of expenses without crowding your everyday dashboard." actions={<button className="icon-button" type="button" onClick={toggleBalances} aria-label={showBalances ? 'Hide balances' : 'Show balances'}>{showBalances ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />
            <section className="insight-switch"><button className={insightMode === 'history' ? 'active' : ''} type="button" onClick={() => setInsightMode('history')}><BarChart3 size={17} />Spending history</button><button className={insightMode === 'averages' ? 'active' : ''} type="button" onClick={() => setInsightMode('averages')}><TrendingUp size={17} />Averages</button></section>
            {insightMode === 'history' ? <>
              <section className="filter-panel insight-filter"><div className="filter-label"><ListFilter size={17} /><span>Time period</span></div><div className="segmented-control">{(['day', 'month', 'year'] as const).map((mode) => <button key={mode} className={historyFilter === mode ? 'active' : ''} type="button" onClick={() => { setHistoryFilter(mode); if (mode === 'day') setDayRange(defaultRanges.day); if (mode === 'month') setMonthRange(defaultRanges.month); if (mode === 'year') setYearRange(defaultRanges.year); }}>{mode === 'day' ? 'Daily' : mode === 'month' ? 'Monthly' : 'Yearly'}</button>)}</div>{historyFilter === 'day' && <><label className="filter-field"><span>From</span><input type="date" value={dayRange.from} max={dayRange.to} onChange={(event) => setDayRange((range) => ({ ...range, from: event.target.value }))} /></label><label className="filter-field"><span>To</span><input type="date" value={dayRange.to} min={dayRange.from} onChange={(event) => setDayRange((range) => ({ ...range, to: event.target.value }))} /></label></>}{historyFilter === 'month' && <><label className="filter-field"><span>From</span><input type="month" value={monthRange.from} max={monthRange.to} onChange={(event) => setMonthRange((range) => ({ ...range, from: event.target.value }))} /></label><label className="filter-field"><span>To</span><input type="month" value={monthRange.to} min={monthRange.from} onChange={(event) => setMonthRange((range) => ({ ...range, to: event.target.value }))} /></label></>}{historyFilter === 'year' && <><label className="filter-field"><span>From</span><input type="number" min="2000" value={yearRange.from} onChange={(event) => setYearRange((range) => ({ ...range, from: event.target.value }))} /></label><label className="filter-field"><span>To</span><input type="number" min={yearRange.from} value={yearRange.to} onChange={(event) => setYearRange((range) => ({ ...range, to: event.target.value }))} /></label></>}<button className="button button-secondary button-small" type="button" onClick={() => void handleLoadHistory()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={15} />Refresh</button></section>
              {historyData ? <><section className="insight-stat-row"><div><span>Total spend in range</span><strong className="amount-negative">{formatMoney(historyData.totalSpending, showBalances)}</strong></div><p>Expenses only · {historyData.transactions.length} recorded transaction{historyData.transactions.length === 1 ? '' : 's'}</p></section><section className="chart-grid"><article className="panel chart-panel"><div className="panel-header"><div><p className="panel-kicker">Volume</p><h2>Spending over time</h2></div></div><div className="chart-area"><ResponsiveContainer width="100%" height={300}><BarChart data={historyData.timelineData} margin={{ top: 8, right: 5, left: -18, bottom: 25 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e9eceb" /><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#718078' }} tickFormatter={(value) => formatTick(value, historyFilter)} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#718078' }} tickFormatter={(value) => formatMoney(Number(value), showBalances, true)} /><Tooltip content={<ChartTooltip visible={showBalances} />} /><Bar dataKey="amount" fill="#0e7a3c" radius={[6, 6, 0, 0]} maxBarSize={52} /></BarChart></ResponsiveContainer></div></article><article className="panel chart-panel"><div className="panel-header"><div><p className="panel-kicker">Distribution</p><h2>Where it went</h2></div></div>{historyData.categoryBreakdown.length ? <div className="category-chart"><ResponsiveContainer width="100%" height={245}><PieChart><Pie data={historyData.categoryBreakdown} dataKey="amount" nameKey="category" innerRadius={62} outerRadius={94} paddingAngle={3}>{historyData.categoryBreakdown.map((_, index) => <Cell fill={PIE_COLORS[index % PIE_COLORS.length]} key={index} />)}</Pie><Tooltip formatter={(value) => formatMoney(Number(value), showBalances)} /></PieChart></ResponsiveContainer><div className="category-legend">{historyData.categoryBreakdown.map((item, index) => <div key={item.category}><span style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} /><span>{item.category}</span><strong>{showBalances ? `${item.percentage}%` : '••%'}</strong></div>)}</div></div> : <EmptyState icon={<BarChart3 size={22} />} title="No category data yet" copy="Your spending distribution will appear after you add expenses." />}</article></section><section className="panel table-panel"><div className="panel-header"><div><p className="panel-kicker">Expense records</p><h2>Transactions in this range</h2></div></div>{historyData.transactions.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Expense</th><th>Category</th><th>Account</th><th>Date</th><th className="align-right">Amount</th><th aria-label="Actions" /></tr></thead><tbody>{historyData.transactions.map((expense) => <tr key={expense.id}><td><div className="transaction-cell"><span className="transaction-icon debit"><TrendingDown size={16} /></span><div><strong>{expense.title}</strong><small>{expense.description || 'Expense'}</small></div></div></td><td><span className="category-chip">{expense.category}</span></td><td><span className="account-table-cell"><AssetIcon type={expense.asset?.type || 'bank'} size={15} />{expense.asset?.name || 'Unknown account'}</span></td><td>{formatDate(expense.date)}</td><td className="align-right amount-cell amount-negative">−{formatMoney(Number(expense.amount), showBalances)}</td><td><button className="icon-button danger-button" type="button" onClick={() => void deleteExpenseFromHistory(expense.id)} aria-label={`Delete ${expense.title}`}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={<Receipt size={22} />} title="No expenses in this period" copy="Change the period or add an expense to begin analysing it." />}</section></> : <section className="panel"><EmptyState icon={<RefreshCw className={loading ? 'spin' : ''} size={22} />} title="Loading your history" copy="Your spending picture is being prepared." /></section>}
            </> : <>
              <section className="filter-panel insight-filter"><div className="filter-label"><ListFilter size={17} /><span>Comparison period</span></div><div className="segmented-control">{(['day', 'month', 'year'] as const).map((mode) => <button key={mode} className={averageFilter === mode ? 'active' : ''} type="button" onClick={() => { setAverageFilter(mode); setAverageRange(defaultRanges[mode]); }}>{mode === 'day' ? 'Daily' : mode === 'month' ? 'Monthly' : 'Yearly'}</button>)}</div><label className="filter-field"><span>From</span><input type={averageFilter === 'day' ? 'date' : averageFilter === 'month' ? 'month' : 'number'} value={averageRange.from} onChange={(event) => setAverageRange((range) => ({ ...range, from: event.target.value }))} /></label><label className="filter-field"><span>To</span><input type={averageFilter === 'day' ? 'date' : averageFilter === 'month' ? 'month' : 'number'} min={averageRange.from} value={averageRange.to} onChange={(event) => setAverageRange((range) => ({ ...range, to: event.target.value }))} /></label><button className="button button-secondary button-small" type="button" onClick={() => void handleLoadAverages()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={15} />Refresh</button></section>
              {averagesData ? <><section className="average-hero"><div><span>Average spend per {averageFilter}</span><strong>{formatMoney(averagesData.meanValue, showBalances)}</strong></div><p>Calculated from expenses only across the selected period.</p></section><section className="panel chart-panel"><div className="panel-header"><div><p className="panel-kicker">Pattern</p><h2>Average spending comparison</h2></div><span className="chart-summary">Mean {formatMoney(averagesData.meanValue, showBalances, true)}</span></div><div className="chart-area chart-area-large"><ResponsiveContainer width="100%" height={370}><BarChart data={averagesData.periodData} margin={{ top: 8, right: 5, left: -18, bottom: 30 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e9eceb" /><XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#718078' }} tickFormatter={(value) => formatTick(value, averageFilter)} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#718078' }} tickFormatter={(value) => formatMoney(Number(value), showBalances, true)} /><Tooltip content={<ChartTooltip visible={showBalances} />} /><Bar dataKey="amount" fill="#1e293b" radius={[6, 6, 0, 0]} maxBarSize={60} /></BarChart></ResponsiveContainer></div></section><section className="insight-note"><TrendingUp size={19} /><p>Use a narrower date range to spot routines rather than isolated large purchases. The average always excludes income.</p></section></> : <section className="panel"><EmptyState icon={<RefreshCw className={loading ? 'spin' : ''} size={22} />} title="Calculating your average" copy="Your expense comparison is being prepared." /></section>}
            </>}
          </>
        )}

        {page === 'profile' && (
          <>
            <PageHeader eyebrow="Profile & settings" title="Make the workspace yours" description="Manage how your name and financial values appear while keeping the rest of the app focused." />
            <section className="profile-grid"><article className="panel profile-card"><div className="profile-card-head"><span className="profile-avatar">{currentUser.name.charAt(0).toUpperCase()}</span><div><h2>{currentUser.name}</h2><p>{currentUser.email}</p></div></div><form className="profile-form" onSubmit={saveProfile}><label>Display name<input value={profileName} onChange={(event) => { setProfileName(event.target.value); setProfileMessage(''); }} placeholder="Your name" /></label><label>Email address<input value={currentUser.email} readOnly aria-describedby="email-help" /><small id="email-help">Email changes need a backend account endpoint, which is not currently available.</small></label>{profileMessage && <p className="profile-message">{profileMessage}</p>}<button className="button button-primary" type="submit"><Check size={16} />Save display name</button></form></article><article className="panel preference-card"><div><p className="panel-kicker">Privacy</p><h2>Balance visibility</h2><p>Hide values throughout the workspace when you are sharing a screen or working in public.</p></div><button className={`preference-toggle ${showBalances ? 'on' : ''}`} type="button" onClick={toggleBalances} aria-pressed={showBalances}><span>{showBalances ? <Eye size={16} /> : <EyeOff size={16} />}</span><span>{showBalances ? 'Balances visible' : 'Balances hidden'}</span></button><div className="preference-tip"><Settings2 size={17} /> This preference is saved in this browser.</div></article></section>

          </>
        )}
      </main>

      {modal === 'asset' && <ModalShell title={assetDraft.id ? 'Edit account' : 'Add an account'} subtitle="Keep each balance separate and easy to reconcile." onClose={closeModal}><form className="modal-form" onSubmit={handleAsset}><label>Account name<input value={assetDraft.name} onChange={(event) => setAssetDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="e.g. City Bank" required /></label><label>Account type<select value={assetDraft.type} onChange={(event) => setAssetDraft((draft) => ({ ...draft, type: event.target.value as Asset['type'] }))}><option value="bank">Bank account</option><option value="wallet">Digital wallet</option><option value="on_hand">Cash on hand</option></select></label><label>Current balance<input type="number" min="0" step="0.01" value={assetDraft.balance} onChange={(event) => setAssetDraft((draft) => ({ ...draft, balance: event.target.value }))} placeholder="0.00" required /></label><footer className="modal-actions">{assetDraft.id ? <button className="button button-danger-quiet" type="button" onClick={() => void handleDeleteAsset()}><Trash2 size={16} />Delete</button> : <span />}<div><button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit">{assetDraft.id ? 'Save changes' : 'Add account'}</button></div></footer></form></ModalShell>}

      {modal === 'income' && <ModalShell title="Add income" subtitle="Record money coming into one of your accounts." onClose={closeModal}>{assets.length ? <form className="modal-form" onSubmit={handleIncome}><label>Income source<input value={incomeDraft.source} onChange={(event) => setIncomeDraft((draft) => ({ ...draft, source: event.target.value }))} placeholder="e.g. Salary" required /></label><div className="form-two-column"><label>Amount<input type="number" min="0.01" step="0.01" value={incomeDraft.amount} onChange={(event) => setIncomeDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="0.00" required /></label><label>Date<input type="date" value={incomeDraft.date} onChange={(event) => setIncomeDraft((draft) => ({ ...draft, date: event.target.value }))} required /></label></div><label>Deposit account<select value={incomeDraft.assetId || assets[0]?.id || ''} onChange={(event) => setIncomeDraft((draft) => ({ ...draft, assetId: event.target.value }))} required>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label>Notes <span>(optional)</span><input value={incomeDraft.description} onChange={(event) => setIncomeDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Optional context" /></label><footer className="modal-actions"><span /><div><button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit"><TrendingUp size={16} />Add income</button></div></footer></form> : <EmptyState icon={<Landmark size={22} />} title="Add an account first" copy="Income needs an account destination." action={<button className="button button-primary" type="button" onClick={() => { closeModal(); openNewAsset(); }}>Add account</button>} />}</ModalShell>}

      {modal === 'expense' && <ModalShell title="Add expense" subtitle="Record money leaving one of your accounts." onClose={closeModal}>{assets.length ? <form className="modal-form" onSubmit={handleExpense}><label>Expense title<input value={expenseDraft.title} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="e.g. Weekly groceries" required /></label><div className="form-two-column"><label>Amount<input type="number" min="0.01" step="0.01" value={expenseDraft.amount} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="0.00" required /></label><label>Category<select value={expenseDraft.category} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, category: event.target.value }))}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div><div className="form-two-column"><label>Date<input type="date" value={expenseDraft.date} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, date: event.target.value }))} required /></label><label>Paid from<select value={expenseDraft.assetId || assets[0]?.id || ''} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, assetId: event.target.value }))} required>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label></div><label>Notes <span>(optional)</span><input value={expenseDraft.description} onChange={(event) => setExpenseDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Optional context" /></label><footer className="modal-actions"><span /><div><button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary button-expense" type="submit"><TrendingDown size={16} />Add expense</button></div></footer></form> : <EmptyState icon={<Landmark size={22} />} title="Add an account first" copy="Expenses need an account source." action={<button className="button button-primary" type="button" onClick={() => { closeModal(); openNewAsset(); }}>Add account</button>} />}</ModalShell>}

      {modal === 'loan' && <ModalShell title="Record money lent" subtitle="Keep the person, amount, and date ready for follow-up." onClose={closeModal}><form className="modal-form" onSubmit={handleLoan}><label>Who owes you?<input value={loanDraft.debtorName} onChange={(event) => setLoanDraft((draft) => ({ ...draft, debtorName: event.target.value }))} placeholder="Person's name" required /></label><div className="form-two-column"><label>Amount<input type="number" min="0.01" step="0.01" value={loanDraft.amount} onChange={(event) => setLoanDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="0.00" required /></label><label>Date lent<input type="date" value={loanDraft.date} onChange={(event) => setLoanDraft((draft) => ({ ...draft, date: event.target.value }))} required /></label></div><label>Notes <span>(optional)</span><input value={loanDraft.description} onChange={(event) => setLoanDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Optional context" /></label><footer className="modal-actions"><span /><div><button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" type="submit">Record loan</button></div></footer></form></ModalShell>}

      {modal === 'borrowing' && <ModalShell title="Record money borrowed" subtitle="Keep repayment obligations visible and organised." onClose={closeModal}><form className="modal-form" onSubmit={handleBorrowing}><label>Who lent you money?<input value={borrowingDraft.lenderName} onChange={(event) => setBorrowingDraft((draft) => ({ ...draft, lenderName: event.target.value }))} placeholder="Person's name" required /></label><div className="form-two-column"><label>Amount<input type="number" min="0.01" step="0.01" value={borrowingDraft.amount} onChange={(event) => setBorrowingDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="0.00" required /></label><label>Date borrowed<input type="date" value={borrowingDraft.date} onChange={(event) => setBorrowingDraft((draft) => ({ ...draft, date: event.target.value }))} required /></label></div><label>Notes <span>(optional)</span><input value={borrowingDraft.description} onChange={(event) => setBorrowingDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Optional context" /></label><footer className="modal-actions"><span /><div><button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary button-expense" type="submit">Record borrowing</button></div></footer></form></ModalShell>}
    </div>
  );
}
