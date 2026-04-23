import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import DashboardScreen from './src/screens/DashboardScreen';
import SignalsScreen from './src/screens/SignalsScreen';
import PositionsScreen from './src/screens/PositionsScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import SettingsScreen from './src/screens/SettingsScreen';

import { registerForPushNotifications, parseSignalFromNotification } from './src/services/notifications';
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

  const { setLoggedIn, setCredentials, setRisk, setPushToken, addSignal, setPendingSignal, risk, signals } = useStore();
  const pendingCount = signals.filter((s) => s.status === 'pending').length;

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

      const token = await registerForPushNotifications();
      if (token) setPushToken(token);
    })();
  }, []);

  // Notification listeners
  useEffect(() => {
    // Notification arrives while app is open
    notifListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, any>;
      const signal = parseSignalFromNotification(data);
      if (!signal) return;

      addSignal(signal);

      if (risk.autoExecute) {
        setPendingSignal(signal);
        // Auto-execute handled in SignalsScreen on mount
      }
    });

    // User taps notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      const signal = parseSignalFromNotification(data);
      if (signal) {
        addSignal(signal);
        setPendingSignal(signal);
        // Navigation to Signals tab happens naturally via state
      }
    });

    return () => {
      if (notifListener.current) Notifications.removeNotificationSubscription(notifListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [risk.autoExecute]);

  return (
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
  );
}
