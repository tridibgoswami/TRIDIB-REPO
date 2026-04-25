export interface Credentials {
  apiKey: string;
  clientId: string;
  password: string;
  totpSecret: string;
}

export interface RiskSettings {
  maxDailyLoss: number;
  maxOpenPositions: number;
  defaultQuantity: number;
  autoExecute: boolean;  // execute trades without confirmation tap
  squareOffTime: string; // e.g. "15:15"
}

export type InstrumentType = 'FUT' | 'CE' | 'PE';
export type ActionType = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type ProductType = 'INTRADAY' | 'DELIVERY' | 'CARRYFORWARD';
export type SignalStatus = 'pending' | 'executed' | 'dismissed' | 'failed';
export type SignalType = 'BUY' | 'SELL' | 'EXIT_BUY' | 'EXIT_SELL' | 'TRAIL_STOP_BUY' | 'TRAIL_STOP_SELL' | 'EOD_EXIT';

export interface TradeSignal {
  id: string;
  symbol: string;
  signalType: SignalType;
  action: ActionType;
  instrument: InstrumentType;
  expiry: string;
  strike: number;
  price: number;
  quantity: number;
  orderType: OrderType;
  productType: ProductType;
  tradingSymbol: string;
  receivedAt: string;
  status: SignalStatus;
  orderId?: string;
  fillPrice?: number;
  errorMessage?: string;
}

export interface Position {
  tradingsymbol: string;
  symboltoken: string;
  exchange: string;
  producttype: string;
  netqty: string;
  averageprice: string;
  ltp: string;
  unrealised: string;
  realised: string;
}

export interface Order {
  orderid: string;
  tradingsymbol: string;
  transactiontype: string;
  ordertype: string;
  producttype: string;
  quantity: string;
  price: string;
  averageprice: string;
  status: string;
  exchtime: string;
}
