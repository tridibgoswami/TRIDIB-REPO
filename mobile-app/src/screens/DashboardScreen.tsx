import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { api } from '../api/angelone';
import { C, fmt } from '../utils/theme';

export default function DashboardScreen() {
  const { isLoggedIn, isHalted, setHalted, positions, setPositions, setOrders, risk } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [squaringOff, setSquaringOff] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) return;
    setRefreshing(true);
    const [pos, orders] = await Promise.all([api.getPositions(), api.getOrderBook()]);
    setPositions(pos);
    setOrders(orders);
    setRefreshing(false);
  }, [isLoggedIn]);

  useEffect(() => { refresh(); }, []);

  const { realised, unrealised, total } = api.getDayPnL(positions);
  const openPositions = positions.filter((p) => parseInt(p.netqty, 10) !== 0);

  const handleSquareOff = () => {
    Alert.alert(
      'Square Off All',
      `Close ${openPositions.length} open position(s) at market price?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Close All',
          style: 'destructive',
          onPress: async () => {
            setSquaringOff(true);
            await api.squareOffAll();
            await refresh();
            setSquaringOff(false);
            Alert.alert('Done', 'Square-off orders placed.');
          },
        },
      ]
    );
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const marketOpen = now.getHours() >= 9 && now.getHours() < 15;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>AlgoTrader</Text>
          <View style={[s.dot, { backgroundColor: isLoggedIn && !isHalted ? C.green : C.red }]} />
        </View>

        {/* Status row */}
        <View style={s.statusRow}>
          <Chip label={isLoggedIn ? 'Connected' : 'Disconnected'} color={isLoggedIn ? C.green : C.red} />
          <Chip label={isHalted ? 'HALTED' : 'Active'} color={isHalted ? C.red : C.green} />
          <Chip label={marketOpen ? 'Market Open' : 'Market Closed'} color={marketOpen ? C.green : C.muted} />
          <Text style={s.time}>{timeStr}</Text>
        </View>

        {/* P&L Cards */}
        <View style={s.pnlRow}>
          <PnLCard label="Realised" value={realised} />
          <PnLCard label="Unrealised" value={unrealised} />
          <PnLCard label="Total P&L" value={total} large />
        </View>

        {/* Loss limit bar */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Daily Loss Used</Text>
          <View style={s.barBg}>
            <View
              style={[
                s.barFill,
                {
                  width: `${Math.min(100, (Math.abs(Math.min(0, total)) / risk.maxDailyLoss) * 100)}%`,
                  backgroundColor: total < -risk.maxDailyLoss * 0.8 ? C.red : C.yellow,
                },
              ]}
            />
          </View>
          <Text style={s.barLabel}>₹{Math.abs(Math.min(0, total)).toFixed(0)} / ₹{risk.maxDailyLoss.toFixed(0)}</Text>
        </View>

        {/* Open positions summary */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Open Positions</Text>
          <Text style={s.bigNum}>{openPositions.length} / {risk.maxOpenPositions}</Text>
        </View>

        {/* Action buttons */}
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: isHalted ? C.green : C.yellow }]}
            onPress={() => setHalted(!isHalted)}
          >
            <Text style={s.btnText}>{isHalted ? '▶ Resume' : '⏸ Halt Bot'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.red, opacity: openPositions.length === 0 ? 0.4 : 1 }]}
            onPress={handleSquareOff}
            disabled={openPositions.length === 0 || squaringOff}
          >
            {squaringOff
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>⬛ Square Off All</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PnLCard({ label, value, large }: { label: string; value: number; large?: boolean }) {
  const color = value >= 0 ? C.green : C.red;
  return (
    <View style={[s.pnlCard, large && s.pnlCardLarge]}>
      <Text style={s.pnlLabel}>{label}</Text>
      <Text style={[s.pnlValue, { color, fontSize: large ? 22 : 16 }]}>
        {value >= 0 ? '+' : ''}₹{Math.abs(value).toFixed(0)}
      </Text>
    </View>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.chip, { borderColor: color }]}>
      <Text style={[s.chipText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Theme util (inline to avoid extra file import) ────────────────────────────
const fmt = { currency: (v: number) => `₹${Math.abs(v).toFixed(2)}` };

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 },
  time: { color: C.muted, fontSize: 12, marginLeft: 'auto' },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '600' },
  pnlRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pnlCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12 },
  pnlCardLarge: { flex: 1.3 },
  pnlLabel: { color: C.muted, fontSize: 11, marginBottom: 4 },
  pnlValue: { fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardLabel: { color: C.muted, fontSize: 12, marginBottom: 8 },
  bigNum: { color: C.text, fontSize: 28, fontWeight: '700' },
  barBg: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barLabel: { color: C.muted, fontSize: 11, marginTop: 4, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
