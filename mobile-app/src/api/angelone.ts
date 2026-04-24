import axios, { AxiosInstance } from 'axios';
import CryptoJS from 'crypto-js';
import { generateTOTP } from '../utils/totp';
import { Credentials, Position, Order, ActionType, OrderType, ProductType } from '../types';
import { Storage } from '../services/storage';

export interface PlaceOrderParams {
  symbolToken: string;
  tradingSymbol: string;
  action: ActionType;
  quantity: number;
  orderType: OrderType;
  price: number;
  productType: ProductType;
  exchange?: string;
}

class AngelOneAPI {
  private client: AxiosInstance;
  private apiKey = '';
  public jwtToken = '';
  public isLoggedIn = false;

  constructor() {
    this.client = axios.create({ baseURL: BASE, timeout: 15000 });
  }

  private headers() {
    return {
      'Authorization': `Bearer ${this.jwtToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': '127.0.0.1',
      'X-ClientPublicIP': '127.0.0.1',
      'X-MACAddress': '00:00:00:00:00:00',
      'X-PrivateKey': this.apiKey,
    };
  }

  async login(creds: Credentials): Promise<{ success: boolean; error?: string }> {
    try {
      this.apiKey = creds.apiKey;
      const totp = generateTOTP(creds.totpSecret);

      const resp = await this.client.post(
        '/rest/auth/angelbroking/user/v1/loginByPassword',
        { clientcode: creds.clientId, password: creds.password, totp },
        { headers: { 'Content-Type': 'application/json', 'X-PrivateKey': creds.apiKey } }
      );

      if (resp.data?.status && resp.data?.data?.jwtToken) {
        this.jwtToken = resp.data.data.jwtToken;
        this.isLoggedIn = true;
        await Storage.saveJWT(this.jwtToken, resp.data.data.refreshToken);
        return { success: true };
      }
      return { success: false, error: resp.data?.message ?? 'Login failed' };
    } catch (e: any) {
      return { success: false, error: e?.response?.data?.message ?? e.message };
    }
  }

  async logout(): Promise<void> {
    const creds = await Storage.getCredentials();
    if (!creds) return;
    try {
      await this.client.post(
        '/rest/secure/angelbroking/user/v1/logout',
        { clientcode: creds.clientId },
        { headers: this.headers() }
      );
    } catch (_) {}
    this.jwtToken = '';
    this.isLoggedIn = false;
    await Storage.clearAuth();
  }

  async placeOrder(params: PlaceOrderParams): Promise<{ orderId?: string; error?: string }> {
    try {
      const body = {
        variety: 'NORMAL',
        tradingsymbol: params.tradingSymbol,
        symboltoken: params.symbolToken,
        transactiontype: params.action,
        exchange: params.exchange ?? 'NFO',
        ordertype: params.orderType,
        producttype: params.productType,
        duration: 'DAY',
        price: params.orderType === 'LIMIT' ? String(params.price) : '0',
        triggerprice: '0',
        quantity: String(params.quantity),
      };
      const resp = await this.client.post(
        '/rest/secure/angelbroking/order/v1/placeOrder',
        body,
        { headers: this.headers() }
      );
      if (resp.data?.status) {
        return { orderId: resp.data.data.orderid };
      }
      return { error: resp.data?.message ?? 'Order rejected' };
    } catch (e: any) {
      return { error: e?.response?.data?.message ?? e.message };
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      const resp = await this.client.get(
        '/rest/secure/angelbroking/order/v1/getPosition',
        { headers: this.headers() }
      );
      return resp.data?.status ? (resp.data.data ?? []) : [];
    } catch (_) { return []; }
  }

  async getOrderBook(): Promise<Order[]> {
    try {
      const resp = await this.client.get(
        '/rest/secure/angelbroking/order/v1/getOrderBook',
        { headers: this.headers() }
      );
      return resp.data?.status ? (resp.data.data ?? []) : [];
    } catch (_) { return []; }
  }

  async searchScrip(exchange: string, symbol: string): Promise<{ symboltoken: string } | null> {
    try {
      const resp = await this.client.get(
        `/rest/secure/angelbroking/order/v1/searchScrip?exchange=${exchange}&searchscrip=${symbol}`,
        { headers: this.headers() }
      );
      if (resp.data?.status && resp.data.data?.length > 0) {
        return resp.data.data[0];
      }
      return null;
    } catch (_) { return null; }
  }

  async squareOffAll(): Promise<string[]> {
    const positions = await this.getPositions();
    const orderIds: string[] = [];
    for (const pos of positions) {
      const netQty = parseInt(pos.netqty, 10);
      if (netQty === 0) continue;
      const action: ActionType = netQty > 0 ? 'SELL' : 'BUY';
      const result = await this.placeOrder({
        symbolToken: pos.symboltoken,
        tradingSymbol: pos.tradingsymbol,
        action,
        quantity: Math.abs(netQty),
        orderType: 'MARKET',
        price: 0,
        productType: (pos.producttype as ProductType) ?? 'INTRADAY',
        exchange: pos.exchange,
      });
      if (result.orderId) orderIds.push(result.orderId);
    }
    return orderIds;
  }

  getDayPnL(positions: Position[]): { realised: number; unrealised: number; total: number } {
    let realised = 0, unrealised = 0;
    for (const p of positions) {
      realised += parseFloat(p.realised || '0');
      unrealised += parseFloat(p.unrealised || '0');
    }
    return { realised, unrealised, total: realised + unrealised };
  }
}

export const api = new AngelOneAPI();
