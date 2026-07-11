// Relative URL — Vite proxies /api → localhost:5001 on the server.
// This works for both local dev AND Cloudflare tunnel (users never hit port 5001 directly).
const API_BASE_URL = '/api';

export interface Asset {
  id: string;
  name: string;
  type: 'bank' | 'wallet' | 'on_hand';
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  debtorName: string;
  amount: number;
  description: string;
  date: string;
  isSettled: boolean;
  createdAt: string;
}

export interface Borrowing {
  id: string;
  lenderName: string;
  amount: number;
  description: string;
  date: string;
  isSettled: boolean;
  createdAt: string;
}

export interface Income {
  id: string;
  source: string;
  amount: number;
  date: string;
  description?: string;
  asset: Asset;
  createdAt: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  description?: string;
  asset: Asset;
  createdAt: string;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface TimelineData {
  period: string;
  amount: number;
}

export interface HistoryResponse {
  transactions: Expense[];
  totalSpending: number;
  categoryBreakdown: CategoryBreakdown[];
  timelineData: TimelineData[];
}

export interface AveragesResponse {
  meanValue: number;
  periodData: TimelineData[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

let authToken: string | null = localStorage.getItem('token');

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options?.headers) {
    Object.entries(options.headers).forEach(([k, v]) => {
      headers[k] = String(v);
    });
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Auth
  register: (data: { name: string; email: string; passwordPlain: string }) => 
    request<{ message: string; user: AuthUser }>('/auth/register', { 
      method: 'POST', 
      body: JSON.stringify({ name: data.name, email: data.email, password: data.passwordPlain }) 
    }),
  login: (data: { email: string; passwordPlain: string }) => 
    request<LoginResponse>('/auth/login', { 
      method: 'POST', 
      body: JSON.stringify({ email: data.email, password: data.passwordPlain }) 
    }),

  // Assets
  getAssets: () => request<Asset[]>('/assets'),
  createAsset: (data: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => 
    request<Asset>('/assets', { method: 'POST', body: JSON.stringify(data) }),
  updateAsset: (id: string, data: Partial<Asset>) => 
    request<Asset>(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAsset: (id: string) => 
    request<void>(`/assets/${id}`, { method: 'DELETE' }),

  // Loans
  getLoans: () => request<Loan[]>('/loans'),
  createLoan: (data: { debtorName: string; amount: number; date: string; description?: string }) => 
    request<Loan>('/loans', { method: 'POST', body: JSON.stringify(data) }),
  settleLoan: (id: string) => 
    request<Loan>(`/loans/${id}/settle`, { method: 'PATCH' }),
  deleteLoan: (id: string) => 
    request<void>(`/loans/${id}`, { method: 'DELETE' }),

  // Borrowings (Borrowed Money)
  getBorrowings: () => request<Borrowing[]>('/borrowings'),
  createBorrowing: (data: { lenderName: string; amount: number; date: string; description?: string }) => 
    request<Borrowing>('/borrowings', { method: 'POST', body: JSON.stringify(data) }),
  settleBorrowing: (id: string) => 
    request<Borrowing>(`/borrowings/${id}/settle`, { method: 'PATCH' }),
  deleteBorrowing: (id: string) => 
    request<void>(`/borrowings/${id}`, { method: 'DELETE' }),

  // Income
  getIncome: () => request<Income[]>('/income'),
  createIncome: (data: { source: string; amount: number; date: string; description?: string; assetId: string }) => 
    request<Income>('/income', { method: 'POST', body: JSON.stringify(data) }),
  deleteIncome: (id: string) => 
    request<void>(`/income/${id}`, { method: 'DELETE' }),

  // Expenses
  getExpenses: () => request<Expense[]>('/expenses'),
  createExpense: (data: { title: string; amount: number; category: string; date: string; description?: string; assetId: string }) => 
    request<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  deleteExpense: (id: string) => 
    request<void>(`/expenses/${id}`, { method: 'DELETE' }),

  // Analytics
  getHistory: (params: {
    fromDay?: string;
    toDay?: string;
    fromMonth?: string;
    toMonth?: string;
    fromYear?: string;
    toYear?: string;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val) searchParams.append(key, val);
    });
    return request<HistoryResponse>(`/analytics/history?${searchParams.toString()}`);
  },

  getAverages: (params: {
    type: 'day' | 'month' | 'year';
    fromDate?: string;
    toDate?: string;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val) searchParams.append(key, val);
    });
    return request<AveragesResponse>(`/analytics/averages?${searchParams.toString()}`);
  },
};
