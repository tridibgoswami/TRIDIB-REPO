import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Storage } from './storage';
import { TradeSignal } from '../types';

// Show notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('signals', {
      name: 'Trade Signals',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00c853',
      sound: 'default',
    });
  }

  // projectId is required in Expo SDK 50+ for EAS builds
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;

  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})).data;
  await Storage.savePushToken(token);
  return token;
}

// Parse the push notification data into a TradeSignal
export function parseSignalFromNotification(data: Record<string, any>): TradeSignal | null {
  try {
    const inst = (data.instrument?.toUpperCase() ?? 'FUT') as TradeSignal['instrument'];
    const expiry = data.expiry?.toUpperCase() ?? '';
    const strike = parseInt(data.strike ?? '0', 10);

    // Prefer trading_symbol sent by Cloudflare Worker (sourced from {{ticker}} in TradingView).
    // That gives the exact AngelOne-compatible symbol e.g. "NIFTY25APR24FUT" — no extra parsing needed.
    let sym = data.symbol?.toUpperCase() ?? '';
    let tradingSymbol: string;
    if (data.trading_symbol) {
      tradingSymbol = String(data.trading_symbol).toUpperCase();
      if (!sym) sym = tradingSymbol.replace(/\d.*/, ''); // extract root if symbol missing
    } else if (inst === 'CE' || inst === 'PE') {
      tradingSymbol = `${sym}${expiry}${String(strike).padStart(5, '0')}${inst}`;
    } else {
      tradingSymbol = `${sym}${expiry}FUT`;
    }

    // Default quantity per instrument if not provided by the alert
    const defaultQty = sym.startsWith('BANKNIFTY') ? 30 : sym.startsWith('NIFTY') ? 65 : 1;

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: sym,
      action: (data.action?.toUpperCase() ?? 'BUY') as TradeSignal['action'],
      instrument: inst,
      expiry,
      strike,
      price: parseFloat(data.price ?? '0'),
      quantity: parseInt(data.quantity ?? String(defaultQty), 10),
      orderType: (data.order_type?.toUpperCase() ?? 'MARKET') as TradeSignal['orderType'],
      productType: (data.product_type?.toUpperCase() ?? 'INTRADAY') as TradeSignal['productType'],
      tradingSymbol,
      receivedAt: new Date().toISOString(),
      status: 'pending',
    };
  } catch (_) {
    return null;
  }
}
