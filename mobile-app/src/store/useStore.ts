import { create } from 'zustand';
import { TradeSignal, Position, Order, RiskSettings, Credentials } from '../types';

interface AppState {
  // Auth
  isLoggedIn: boolean;
  setLoggedIn: (v: boolean) => void;

  // Credentials & Settings
  credentials: Credentials | null;
  setCredentials: (c: Credentials | null) => void;
  risk: RiskSettings;
  setRisk: (r: RiskSettings) => void;

  // Market data
  positions: Position[];
  setPositions: (p: Position[]) => void;
  orders: Order[];
  setOrders: (o: Order[]) => void;

  // Signals
  signals: TradeSignal[];
  addSignal: (s: TradeSignal) => void;
  updateSignal: (id: string, patch: Partial<TradeSignal>) => void;
  pendingSignal: TradeSignal | null;
  setPendingSignal: (s: TradeSignal | null) => void;

  // Bot state
  isHalted: boolean;
  setHalted: (v: boolean) => void;
  pushToken: string;
  setPushToken: (t: string) => void;
}

export const useStore = create<AppState>((set) => ({
  isLoggedIn: false,
  setLoggedIn: (v) => set({ isLoggedIn: v }),

  credentials: null,
  setCredentials: (c) => set({ credentials: c }),

  risk: {
    maxDailyLoss: 5000,
    maxOpenPositions: 2,
    defaultQuantity: 65, // NIFTY 1 lot = 65 units; BANKNIFTY 1 lot = 30 units
    autoExecute: false,
    squareOffTime: '15:15',
  },
  setRisk: (r) => set({ risk: r }),

  positions: [],
  setPositions: (positions) => set({ positions }),
  orders: [],
  setOrders: (orders) => set({ orders }),

  signals: [],
  addSignal: (s) => set((state) => ({ signals: [s, ...state.signals].slice(0, 50) })),
  updateSignal: (id, patch) =>
    set((state) => ({
      signals: state.signals.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),

  pendingSignal: null,
  setPendingSignal: (s) => set({ pendingSignal: s }),

  isHalted: false,
  setHalted: (v) => set({ isHalted: v }),

  pushToken: '',
  setPushToken: (t) => set({ pushToken: t }),
}));
