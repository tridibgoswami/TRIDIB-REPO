import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await Storage.savePushToken(token);
  return token;
}

// Parse the push notification data into a TradeSignal
export function parseSignalFromNotification(data: Record<string, any>): TradeSignal | null {
  try {
    const sym = data.symbol?.toUpperCase();
    const inst = data.instrument?.toUpperCase() ?? 'FUT';
    const expiry = data.expiry?.toUpperCase() ?? '';
    const strike = parseInt(data.strike ?? '0', 10);

    let tradingSymbol = `${sym}${expiry}FUT`;
    if (inst === 'CE' || inst === 'PE') {
      tradingSymbol = `${sym}${expiry}${String(strike).padStart(5, '0')}${inst}`;
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: sym,
      action: data.action?.toUpperCase() ?? 'BUY',
      instrument: inst,
      expiry,
      strike,
      price: parseFloat(data.price ?? '0'),
      quantity: parseInt(data.quantity ?? '25', 10),
      orderType: data.order_type?.toUpperCase() ?? 'MARKET',
      productType: data.product_type?.toUpperCase() ?? 'INTRADAY',
      tradingSymbol,
      receivedAt: new Date().toISOString(),
      status: 'pending',
    };
  } catch (_) {
    return null;
  }
}
