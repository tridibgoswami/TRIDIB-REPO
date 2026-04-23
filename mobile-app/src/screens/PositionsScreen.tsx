import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { api } from '../api/angelone';
import { Position } from '../types';
import { C, fmt } from '../utils/theme';

export default function PositionsScreen() {
  const { positions, setPositions, isLoggedIn } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) return;
    setRefreshing(true);
    setPositions(await api.getPositions());
    setRefreshing(false);
  }, [isLoggedIn]);

  const open = positions.filter((p) => parseInt(p.netqty, 10) !== 0);
  const closed = positions.filter((p) => parseInt(p.netqty, 10) === 0);

  const renderPos = ({ item }: { item: Position }) => {
    const qty = parseInt(item.netqty, 10);
    const unreal = parseFloat(item.unrealised);
    const side = qty > 0 ? 'LONG' : 'SHORT';
    const sideColor = qty > 0 ? C.green : C.red;
    return (
      <View style={[s.card, { borderLeftColor: sideColor }]}>
        <View style={s.row}>
          <Text style={s.symbol}>{item.tradingsymbol}</Text>
          <Text style={[s.pnl, { color: unreal >= 0 ? C.green : C.red }]}>
            {fmt.currency(unreal)}
          </Text>
        </View>
        <View style={s.details}>
          <Tag label={side} color={sideColor} />
          <Detail label="Qty" value={String(Math.abs(qty))} />
          <Detail label="Avg" value={`₹${parseFloat(item.averageprice).toFixed(2)}`} />
          <Detail label="LTP" value={`₹${parseFloat(item.ltp).toFixed(2)}`} />
          <Detail label="Real" value={fmt.currency(parseFloat(item.realised))} />
        </View>
      </View>
    );
  };

  const { realised, unrealised, total } = api.getDayPnL(positions);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Positions</Text>
        <View style={s.pnlSummary}>
          <Text style={[s.totalPnl, { color: total >= 0 ? C.green : C.red }]}>
            {fmt.currency(total)}
          </Text>
        </View>
      </View>

      <FlatList
        data={open}
        keyExtractor={(item) => item.tradingsymbol}
        renderItem={renderPos}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} />}
        ListHeaderComponent={open.length > 0
          ? <Text style={s.sectionLabel}>OPEN ({open.length})</Text>
          : null
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No open positions</Text>
          </View>
        }
        ListFooterComponent={
          closed.length > 0 ? (
            <>
              <Text style={[s.sectionLabel, { marginTop: 16 }]}>CLOSED ({closed.length})</Text>
              {closed.map((item) => renderPos({ item }))}
            </>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.tag, { borderColor: color }]}>
      <Text style={[s.tagText, { color }]}>{label}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginRight: 10 }}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  pnlSummary: {},
  totalPnl: { fontSize: 18, fontWeight: '700' },
  sectionLabel: { color: C.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  symbol: { color: C.text, fontSize: 15, fontWeight: '700', flex: 1 },
  pnl: { fontSize: 16, fontWeight: '700' },
  details: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  tag: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginRight: 8 },
  tagText: { fontSize: 10, fontWeight: '700' },
  detailLabel: { color: C.muted, fontSize: 10 },
  detailValue: { color: C.text, fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: C.muted, fontSize: 15 },
});
