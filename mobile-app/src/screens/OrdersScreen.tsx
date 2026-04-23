import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { api } from '../api/angelone';
import { Order } from '../types';
import { C } from '../utils/theme';

const STATUS_COLOR: Record<string, string> = {
  complete: C.green,
  rejected: C.red,
  cancelled: C.muted,
  open: C.yellow,
  pending: C.yellow,
};

export default function OrdersScreen() {
  const { orders, setOrders, isLoggedIn } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) return;
    setRefreshing(true);
    setOrders(await api.getOrderBook());
    setRefreshing(false);
  }, [isLoggedIn]);

  const renderOrder = ({ item }: { item: Order }) => {
    const isBuy = item.transactiontype === 'BUY';
    const statusColor = STATUS_COLOR[item.status?.toLowerCase()] ?? C.muted;
    return (
      <View style={s.card}>
        <View style={s.top}>
          <View style={s.row}>
            <Text style={[s.action, { color: isBuy ? C.green : C.red }]}>
              {isBuy ? '▲' : '▼'} {item.transactiontype}
            </Text>
            <Text style={s.symbol}>{item.tradingsymbol}</Text>
          </View>
          <Text style={[s.status, { color: statusColor }]}>{item.status?.toUpperCase()}</Text>
        </View>
        <View style={s.details}>
          <Detail label="Qty" value={item.quantity} />
          <Detail label="Type" value={item.ordertype} />
          <Detail label="Avg Price" value={`₹${parseFloat(item.averageprice || '0').toFixed(2)}`} />
          <Detail label="Product" value={item.producttype} />
        </View>
        <Text style={s.orderId}>ID: {item.orderid}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <Text style={s.title}>Orders — Today</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.orderid}
        renderItem={renderOrder}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No orders today</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
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
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: { fontSize: 13, fontWeight: '700' },
  symbol: { color: C.text, fontSize: 14, fontWeight: '600' },
  status: { fontSize: 11, fontWeight: '700' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  detailLabel: { color: C.muted, fontSize: 10 },
  detailValue: { color: C.text, fontSize: 12, fontWeight: '600' },
  orderId: { color: C.muted, fontSize: 10, marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: C.muted, fontSize: 15 },
});
