import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Storage } from './storage';
import { api } from '../api/angelone';
import { parseSignalFromNotification } from './notifications';
import { TradeSignal } from '../types';

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

const SQUARE_OFF_TYPES = ['EOD_EXIT', 'FORCE_EXIT_BUY', 'FORCE_EXIT_SELL'];

export async function autoExecuteSignal(
  signal: TradeSignal,
): Promise<{ orderId?: string; error?: string }> {
  if (!api.isLoggedIn) {
    const creds = await Storage.getCredentials();
    if (!creds) return { error: 'No credentials saved' };
    const loginResult = await api.login(creds);
    if (!loginResult.success) return { error: loginResult.error ?? 'Login failed' };
  }

  if (SQUARE_OFF_TYPES.includes(signal.signalType)) {
    const ids = await api.squareOffAll();
    return { orderId: ids.join(',') || 'no_open_positions' };
  }

  const exchange =
    signal.instrument === 'FUT' || signal.instrument === 'CE' || signal.instrument === 'PE'
      ? 'NFO'
      : 'NSE';
  const scrip = await api.searchScrip(exchange, signal.tradingSymbol);
  if (!scrip) return { error: `Symbol not found: ${signal.tradingSymbol}` };

  return api.placeOrder({
    symbolToken: scrip.symboltoken,
    tradingSymbol: signal.tradingSymbol,
    action: signal.action,
    quantity: signal.quantity,
    orderType: signal.orderType,
    price: signal.price,
    productType: signal.productType,
    exchange,
  });
}

// Defined at module level — required by expo-task-manager
TaskManager.defineTask(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }: { data: unknown; error: TaskManager.TaskManagerError | null }) => {
    if (error) return;

    const notification = (data as any).notification as Notifications.Notification;
    const notifData = notification?.request?.content?.data as Record<string, any> | undefined;
    if (!notifData) return;

    const signal = parseSignalFromNotification(notifData);
    if (!signal) return;

    // Always persist so signal appears in Signals tab when app opens
    await Storage.appendSignal(signal);

    const risk = await Storage.getRisk();
    if (!risk.autoExecute) return;

    const result = await autoExecuteSignal(signal);
    const patch = result.orderId
      ? { status: 'executed' as const, orderId: result.orderId }
      : { status: 'failed' as const, errorMessage: result.error };
    await Storage.patchSignal(signal.id, patch);
  },
);
