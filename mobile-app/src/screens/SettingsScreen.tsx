import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { api } from '../api/angelone';
import { Storage } from '../services/storage';
import { Credentials, RiskSettings } from '../types';
import { C } from '../utils/theme';
import { generateTOTP } from '../utils/totp';

export default function SettingsScreen() {
  const { credentials, setCredentials, risk, setRisk, isLoggedIn, setLoggedIn, pushToken } = useStore();

  const [creds, setCreds] = useState<Credentials>({
    apiKey: '', clientId: '', password: '', totpSecret: '',
  });
  const [riskLocal, setRiskLocal] = useState<RiskSettings>(risk);
  const [loading, setLoading] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpSecondsLeft, setTotpSecondsLeft] = useState(30);

  useEffect(() => {
    Storage.getCredentials().then((c) => { if (c) setCreds(c); });
    Storage.getRisk().then(setRiskLocal);
  }, []);

  // Refresh TOTP every second when secret is available
  useEffect(() => {
    if (!creds.totpSecret) return;
    const refresh = () => {
      try {
        setTotpCode(generateTOTP(creds.totpSecret));
        setTotpSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30));
      } catch (_) { setTotpCode('ERROR'); }
    };
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [creds.totpSecret]);

  const handleConnect = async () => {
    if (!creds.apiKey || !creds.clientId || !creds.password || !creds.totpSecret) {
      return Alert.alert('Missing Fields', 'Fill in all credential fields.');
    }
    setLoading(true);
    const result = await api.login(creds);
    setLoading(false);
    if (result.success) {
      await Storage.saveCredentials(creds);
      setCredentials(creds);
      setLoggedIn(true);
      Alert.alert('✅ Connected', 'Successfully logged in to AngelOne.');
    } else {
      Alert.alert('Login Failed', result.error ?? 'Check your credentials.');
    }
  };

  const handleDisconnect = async () => {
    await api.logout();
    setLoggedIn(false);
    Alert.alert('Disconnected', 'Logged out from AngelOne.');
  };

  const handleSaveRisk = async () => {
    await Storage.saveRisk(riskLocal);
    setRisk(riskLocal);
    Alert.alert('✅ Saved', 'Risk settings updated.');
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Settings</Text>

        {/* Connection Status */}
        <View style={[s.statusBar, { backgroundColor: isLoggedIn ? '#0d2818' : '#2d0f0f' }]}>
          <View style={[s.statusDot, { backgroundColor: isLoggedIn ? C.green : C.red }]} />
          <Text style={[s.statusText, { color: isLoggedIn ? C.green : C.red }]}>
            {isLoggedIn ? 'Connected to AngelOne' : 'Not Connected'}
          </Text>
        </View>

        {/* AngelOne Credentials */}
        <Section title="AngelOne Credentials">
          <Input label="API Key" value={creds.apiKey} onChangeText={(v) => setCreds({ ...creds, apiKey: v })} placeholder="Your SmartAPI key" secureText={!showCreds} />
          <Input label="Client ID" value={creds.clientId} onChangeText={(v) => setCreds({ ...creds, clientId: v })} placeholder="e.g. A123456" autoCapitalize="characters" />
          <Input label="MPIN" value={creds.password} onChangeText={(v) => setCreds({ ...creds, password: v })} placeholder="4-digit MPIN" secureText={!showCreds} keyboardType="numeric" />
          <Input label="TOTP Secret (Base32)" value={creds.totpSecret} onChangeText={(v) => setCreds({ ...creds, totpSecret: v })} placeholder="Base32 secret from AngelOne app" secureText={!showCreds} autoCapitalize="characters" />

          <TouchableOpacity onPress={() => setShowCreds(!showCreds)} style={s.toggle}>
            <Text style={s.toggleText}>{showCreds ? '🙈 Hide' : '👁 Show'} credentials</Text>
          </TouchableOpacity>

          {creds.totpSecret ? (
            <View style={s.totpBox}>
              <Text style={s.totpLabel}>Live TOTP Code (compare with Google Authenticator)</Text>
              <View style={s.totpRow}>
                <Text style={s.totpCode}>{totpCode}</Text>
                <Text style={s.totpTimer}>{totpSecondsLeft}s</Text>
              </View>
              <Text style={s.hint}>If this matches your Authenticator app → TOTP secret is correct</Text>
            </View>
          ) : null}

          {isLoggedIn
            ? <TouchableOpacity style={[s.btn, { backgroundColor: C.red }]} onPress={handleDisconnect}>
                <Text style={s.btnText}>Disconnect</Text>
              </TouchableOpacity>
            : <TouchableOpacity style={[s.btn, { backgroundColor: C.green }]} onPress={handleConnect} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Connect to AngelOne</Text>}
              </TouchableOpacity>
          }
        </Section>

        {/* Risk Settings */}
        <Section title="Risk Management">
          <Input
            label="Daily Loss Limit (₹)"
            value={String(riskLocal.maxDailyLoss)}
            onChangeText={(v) => setRiskLocal({ ...riskLocal, maxDailyLoss: parseFloat(v) || 0 })}
            keyboardType="numeric"
          />
          <Input
            label="Max Open Positions"
            value={String(riskLocal.maxOpenPositions)}
            onChangeText={(v) => setRiskLocal({ ...riskLocal, maxOpenPositions: parseInt(v) || 1 })}
            keyboardType="numeric"
          />
          <Input
            label="Default Quantity (lots)"
            value={String(riskLocal.defaultQuantity)}
            onChangeText={(v) => setRiskLocal({ ...riskLocal, defaultQuantity: parseInt(v) || 1 })}
            keyboardType="numeric"
          />
          <Input
            label="Auto Square-Off Time (IST)"
            value={riskLocal.squareOffTime}
            onChangeText={(v) => setRiskLocal({ ...riskLocal, squareOffTime: v })}
            placeholder="e.g. 15:15"
          />
          <View style={s.switchRow}>
            <View>
              <Text style={s.label}>Auto-Execute Signals</Text>
              <Text style={s.hint}>Execute trades immediately without confirmation tap</Text>
            </View>
            <Switch
              value={riskLocal.autoExecute}
              onValueChange={(v) => setRiskLocal({ ...riskLocal, autoExecute: v })}
              trackColor={{ true: C.green, false: C.border }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity style={[s.btn, { backgroundColor: C.blue }]} onPress={handleSaveRisk}>
            <Text style={s.btnText}>Save Risk Settings</Text>
          </TouchableOpacity>
        </Section>

        {/* Push Token (for Cloudflare Worker config) */}
        <Section title="Cloudflare Worker Setup">
          <Text style={s.hint}>Copy this token into your Cloudflare Worker Secrets as EXPO_PUSH_TOKEN.</Text>
          <View style={s.tokenBox}>
            <Text style={s.tokenText} selectable>
              {pushToken || 'Not registered yet'}
            </Text>
          </View>
          {!pushToken && (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: C.blue, marginTop: 8 }]}
              onPress={async () => {
                const { registerForPushNotifications } = require('../services/notifications');
                const token = await registerForPushNotifications();
                if (token) {
                  const { useStore: store } = require('../store/useStore');
                  store.getState().setPushToken(token);
                  Alert.alert('✅ Token registered', token);
                } else {
                  Alert.alert('Failed', 'Could not get push token. Make sure notifications are allowed in phone Settings.');
                }
              }}
            >
              <Text style={s.btnText}>Retry Token Registration</Text>
            </TouchableOpacity>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Input({
  label, value, onChangeText, placeholder, secureText, keyboardType, autoCapitalize,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; secureText?: boolean; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={s.inputWrap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        secureTextEntry={secureText}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 80 },
  title: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 16 },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontWeight: '600', fontSize: 14 },
  section: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 14 },
  inputWrap: { marginBottom: 12 },
  label: { color: C.text, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { color: C.muted, fontSize: 11, marginBottom: 8 },
  input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14 },
  toggle: { alignSelf: 'flex-start', marginBottom: 12 },
  toggleText: { color: C.blue, fontSize: 13 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, marginBottom: 12 },
  btn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tokenBox: { backgroundColor: C.bg, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  tokenText: { color: C.blue, fontSize: 11, fontFamily: 'monospace' },
  totpBox: { backgroundColor: '#0d1f12', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.green, marginBottom: 12 },
  totpLabel: { color: C.muted, fontSize: 11, marginBottom: 6 },
  totpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totpCode: { color: C.green, fontSize: 28, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 4 },
  totpTimer: { color: C.muted, fontSize: 13 },
});
