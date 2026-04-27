import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { api } from '../api/angelone';
import { TradeSignal } from '../types';
import { C, fmt } from '../utils/theme';

export default function SignalsScreen() {
  const { signals, updateSignal, isLoggedIn, isHalted, positions, risk } = useStore();
  const [executing, setExecuting] = useState<string | null>(null);

  const EXIT_TYPES = ['EXIT_BUY', 'EXIT_SELL', 'BUY_TARGET', 'SELL_TARGET', 'TRAIL_STOP_BUY', 'TRAIL_STOP_SELL', 'EXIT_BUY_EARLY', 'EXIT_SELL_EARLY', 'FORCE_EXIT_BUY', 'FORCE_EXIT_SELL', 'EOD_EXIT'];

  const execute = async (signal: TradeSignal) => {
    if (!isLoggedIn) return Alert.alert('Not connected', 'Log in first from Settings.');
    if (isHalted) return Alert.alert('Bot halted', 'Resume from Dashboard first.');

    const isExit = EXIT_TYPES.includes(signal.signalType);

    // Only enforce max positions for new entries, not exits
    if (!isExit) {
      const openCount = positions.filter((p) => parseInt(p.netqty, 10) !== 0).length;
      if (openCount >= risk.maxOpenPositions)
        return Alert.alert('Max positions', `Limit is ${risk.maxOpenPositions}. Square off first.`);
    }

    setExecuting(signal.id);

    // EOD Exit — square off all open positions
    if (signal.signalType === 'EOD_EXIT') {
      const orderIds = await api.squareOffAll();
      setExecuting(null);
      if (orderIds.length > 0) {
        updateSignal(signal.id, { status: 'executed', orderId: orderIds.join(',') });
        Alert.alert('✅ Squared Off', `${orderIds.length} position(s) closed.`);
      } else {
        updateSignal(signal.id, { status: 'dismissed', errorMessage: 'No open positions to close' });
        Alert.alert('Nothing to close', 'No open positions found.');
      }
      return;
    }

    const exchange = signal.instrument === 'FUT' || signal.instrument === 'CE' || signal.instrument === 'PE' ? 'NFO' : 'NSE';
    const scrip = await api.searchScrip(exchange, signal.tradingSymbol);
    if (!scrip) {
      updateSignal(signal.id, { status: 'failed', errorMessage: `Symbol not found: ${signal.tradingSymbol}` });
      setExecuting(null);
      return Alert.alert('Symbol Not Found', `"${signal.tradingSymbol}" not on ${exchange}. Check the alert JSON.`);
    }

    const result = await api.placeOrder({
      symbolToken: scrip.symboltoken,
      tradingSymbol: signal.tradingSymbol,
      action: signal.action,
      quantity: signal.quantity,
      orderType: signal.orderType,
      price: signal.price,
      productType: signal.productType,
      exchange,
    });
    setExecuting(null);

    if (result.orderId) {
      updateSignal(signal.id, { status: 'executed', orderId: result.orderId });
      Alert.alert('✅ Order Placed', `Order ID: ${result.orderId}`);
    } else {
      updateSignal(signal.id, { status: 'failed', errorMessage: result.error });
      Alert.alert('❌ Order Failed', result.error ?? 'Unknown error');
    }
  };

  const SIGNAL_LABELS: Record<string, string> = {
    BUY:              '▲ BUY',
    SELL:             '▼ SELL',
    EXIT_BUY:         '▲ EXIT BUY',
    EXIT_SELL:        '▼ EXIT SELL',
    BUY_TARGET:       '🎯 BUY TARGET',
    SELL_TARGET:      '🎯 SELL TARGET',
    TRAIL_STOP_BUY:   '▲ TRAIL STOP BUY',
    TRAIL_STOP_SELL:  '▼ TRAIL STOP SELL',
    EXIT_BUY_EARLY:   '▲ EARLY EXIT BUY',
    EXIT_SELL_EARLY:  '▼ EARLY EXIT SELL',
    FORCE_EXIT_BUY:   '⏰ FORCE EXIT BUY',
    FORCE_EXIT_SELL:  '⏰ FORCE EXIT SELL',
    EOD_EXIT:         '⬛ EOD EXIT',
  };

  const renderSignal = ({ item }: { item: TradeSignal }) => {
    const isBuy = item.action === 'BUY';
    const isPending = item.status === 'pending';
    const isEodExit = item.signalType === 'EOD_EXIT';
    const labelColor = isEodExit ? C.yellow : isBuy ? C.green : C.red;
    return (
      <View style={[s.card, { borderLeftColor: labelColor }]}>
        <View style={s.cardTop}>
          <Text style={[s.action, { color: labelColor }]}>
            {SIGNAL_LABELS[item.signalType] ?? (isBuy ? '▲ BUY' : '▼ SELL')}
          </Text>
          <StatusBadge status={item.status} />
        </View>
        <Text style={s.symbol}>{item.tradingSymbol}</Text>
        <View style={s.row}>
          <Detail label="Qty" value={String(item.quantity)} />
          <Detail label="Type" value={item.orderType} />
          <Detail label="Product" value={item.productType} />
          <Detail label="Time" value={fmt.time(item.receivedAt)} />
        </View>
        {item.orderId && (
          <Text style={s.orderId}>Order: {item.orderId}</Text>
        )}
        {item.errorMessage && (
          <Text style={s.error}>{item.errorMessage}</Text>
        )}
        {isPending && (
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.execBtn, { backgroundColor: isBuy ? C.green : C.red }]}
              onPress={() => execute(item)}
              disabled={executing === item.id}
            >
              {executing === item.id
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.execBtnText}>Execute</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={s.dismissBtn}
              onPress={() => updateSignal(item.id, { status: 'dismissed' })}
              disabled={!!executing}
            >
              <Text style={s.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <Text style={s.title}>Signals</Text>
      {signals.length === 0
        ? <View style={s.empty}><Text style={s.emptyText}>No signals yet. Waiting for TradingView...</Text></View>
        : (
          <FlatList
            data={signals}
            keyExtractor={(item) => item.id}
            renderItem={renderSignal}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          />
        )}
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: TradeSignal['status'] }) {
  const map: Record<string, [string, string]> = {
    pending: ['PENDING', C.yellow],
    executed: ['EXECUTED', C.green],
    dismissed: ['DISMISSED', C.muted],
    failed: ['FAILED', C.red],
  };
  const [label, color] = map[status] ?? ['UNKNOWN', C.muted];
  return <Text style={[s.badge, { color }]}>{label}</Text>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginRight: 12 }}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  title: { fontSize: 20, fontWeight: '700', color: C.text, padding: 16, paddingBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 3 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  action: { fontSize: 15, fontWeight: '700' },
  badge: { fontSize: 11, fontWeight: '700' },
  symbol: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  detailLabel: { color: C.muted, fontSize: 10 },
  detailValue: { color: C.text, fontSize: 13, fontWeight: '600' },
  orderId: { color: C.blue, fontSize: 11, marginTop: 6 },
  error: { color: C.red, fontSize: 11, marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  execBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  execBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dismissBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  dismissText: { color: C.muted, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: C.muted, fontSize: 15, textAlign: 'center', paddingHorizontal: 40 },
});
