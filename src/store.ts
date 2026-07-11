import { create } from 'zustand';
import { api, setAuthToken } from './api';
import type { Asset, Loan, Borrowing, Income, Expense, HistoryResponse, AveragesResponse, AuthUser } from './api';

interface AppState {
  currentUser: AuthUser | null;
  loading: boolean;
  error: string | null;

  assets: Asset[];
  loans: Loan[];
  borrowings: Borrowing[];
  incomes: Income[];
  expenses: Expense[];
  historyData: HistoryResponse | null;
  averagesData: AveragesResponse | null;

  setCurrentUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  loadOverview: () => Promise<void>;
  loadHistory: (params: any) => Promise<void>;
  loadAverages: (params: any) => Promise<void>;
  logout: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  currentUser: (() => {
    const s = localStorage.getItem('user');
    return s ? JSON.parse(s) : null;
  })(),
  loading: false,
  error: null,

  assets: [],
  loans: [],
  borrowings: [],
  incomes: [],
  expenses: [],
  historyData: null,
  averagesData: null,

  setCurrentUser: (user) => set({ currentUser: user }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  loadOverview: async () => {
    const { currentUser } = get();
    if (!currentUser) return;
    set({ loading: true, error: null });
    try {
      const [assets, loans, borrowings, incomes, expenses] = await Promise.all([
        api.getAssets(),
        api.getLoans(),
        api.getBorrowings(),
        api.getIncome(),
        api.getExpenses(),
      ]);
      set({ assets, loans, borrowings, incomes, expenses });
    } catch (requestError) {
      set({ error: requestError instanceof Error ? requestError.message : 'Unable to load your financial data.' });
    } finally {
      set({ loading: false });
    }
  },

  loadHistory: async (params) => {
    const { currentUser } = get();
    if (!currentUser) return;
    set({ loading: true, error: null });
    try {
      const historyData = await api.getHistory(params);
      set({ historyData });
    } catch (requestError) {
      set({ error: requestError instanceof Error ? requestError.message : 'Unable to load spending history.' });
    } finally {
      set({ loading: false });
    }
  },

  loadAverages: async (params) => {
    const { currentUser } = get();
    if (!currentUser) return;
    set({ loading: true, error: null });
    try {
      const averagesData = await api.getAverages(params);
      set({ averagesData });
    } catch (requestError) {
      set({ error: requestError instanceof Error ? requestError.message : 'Unable to calculate averages.' });
    } finally {
      set({ loading: false });
    }
  },

  logout: () => {
    setAuthToken(null);
    localStorage.removeItem('user');
    set({
      currentUser: null,
      assets: [],
      loans: [],
      borrowings: [],
      incomes: [],
      expenses: [],
      historyData: null,
      averagesData: null,
      error: null,
    });
  },
}));
