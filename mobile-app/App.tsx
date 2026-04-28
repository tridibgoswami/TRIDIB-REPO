import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, Alert, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import DashboardScreen from './src/screens/DashboardScreen';
import SignalsScreen from './src/screens/SignalsScreen';
import PositionsScreen from './src/screens/PositionsScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import SettingsScreen from './src/screens/SettingsScreen';

import { registerForPushNotifications, parseSignalFromNotification } from './src/services/notifications';
import { BACKGROUND_NOTIFICATION_TASK, autoExecuteSignal } from './src/services/backgroundTask';
import { Storage } from './src/services/storage';
import { api } from './src/api/angelone';
import { useStore } from './src/store/useStore';
import { C } from './src/utils/theme';

const Tab = createBottomTabNavigator();

const DARK_NAV_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.card, border: C.border, text: C.text },
};

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20, color: focused ? C.green : C.muted }}>{icon}</Text>
    </View>
  );
}

export default function App() {
  const notifListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  const { setLoggedIn, setCredentials, setRisk, setPushToken, addSignal, updateSignal, setSignals, risk, signals } = useStore();
  const pendingCount = signals.filter((s) => s.status === 'pending').length;

  const loadSignalsFromStorage = async () => {
    const saved = await Storage.loadSignals();
    if (saved.length > 0) setSignals(saved);
  };

  // Restore session on launch
  useEffect(() => {
    (async () => {
      const creds = await Storage.getCredentials();
      const riskSettings = await Storage.getRisk();
      setRisk(riskSettings);

      if (creds) {
        setCredentials(creds);
        const result = await api.login(creds);
        if (result.success) setLoggedIn(true);
      }

      // Load signals saved by background task
      await loadSignalsFromStorage();

      const token = await registerForPushNotifications();
      if (token) {
        setPushToken(token);
        // Register background task so trades execute even when app is not in foreground
        Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});
      }
    })();
  }, []);

  // Reload signals from storage when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') loadSignalsFromStorage();
    });
    return () => sub.remove();
  }, []);

  // Notification listeners
  useEffect(() => {
    // Notification arrives while app is in foreground
    notifListener.current = Notifications.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data as Record<string, any>;
      const signal = parseSignalFromNotification(data);
      if (!signal) return;

      addSignal(signal);
      await Storage.appendSignal(signal);

      if (risk.autoExecute) {
        const result = await autoExecuteSignal(signal);
        const patch = result.orderId
          ? { status: 'executed' as const, orderId: result.orderId }
          : { status: 'failed' as const, errorMessage: result.error };
        updateSignal(signal.id, patch);
        await Storage.patchSignal(signal.id, patch);
      }
    });

    // User taps notification (app was in background)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      const signal = parseSignalFromNotification(data);
      if (!signal) return;

      // Signal may already be in storage (saved by background task); reload to get latest status
      await loadSignalsFromStorage();
    });

    return () => {
      if (notifListener.current) Notifications.removeNotificationSubscription(notifListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [risk.autoExecute]);

  return (
    <SafeAreaProvider>
    <NavigationContainer theme={DARK_NAV_THEME}>
      <StatusBar style="light" backgroundColor={C.bg} />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border, height: 60, paddingBottom: 8 },
          tabBarActiveTintColor: C.green,
          tabBarInactiveTintColor: C.muted,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📊" label="Home" focused={focused} /> }}
        />
        <Tab.Screen
          name="Signals"
          component={SignalsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon icon="⚡" label="Signals" focused={focused} />,
            tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          }}
        />
        <Tab.Screen
          name="Positions"
          component={PositionsScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📂" label="Positions" focused={focused} /> }}
        />
        <Tab.Screen
          name="Orders"
          component={OrdersScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📋" label="Orders" focused={focused} /> }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" label="Settings" focused={focused} /> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
    </SafeAreaProvider>
  );
}
