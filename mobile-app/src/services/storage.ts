import * as SecureStore from 'expo-secure-store';
import { Credentials, RiskSettings } from '../types';

const KEYS = {
  CREDENTIALS: 'ao_credentials',
  RISK: 'risk_settings',
  JWT: 'ao_jwt',
  REFRESH: 'ao_refresh',
  PUSH_TOKEN: 'expo_push_token',
} as const;

export const Storage = {
  async saveCredentials(creds: Credentials): Promise<void> {
    await SecureStore.setItemAsync(KEYS.CREDENTIALS, JSON.stringify(creds));
  },

  async getCredentials(): Promise<Credentials | null> {
    const val = await SecureStore.getItemAsync(KEYS.CREDENTIALS);
    return val ? JSON.parse(val) : null;
  },

  async saveRisk(settings: RiskSettings): Promise<void> {
    await SecureStore.setItemAsync(KEYS.RISK, JSON.stringify(settings));
  },

  async getRisk(): Promise<RiskSettings> {
    const val = await SecureStore.getItemAsync(KEYS.RISK);
    if (val) return JSON.parse(val);
    return {
      maxDailyLoss: 5000,
      maxOpenPositions: 2,
      defaultQuantity: 25,
      autoExecute: false,
      squareOffTime: '15:15',
    };
  },

  async saveJWT(token: string, refresh: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.JWT, token);
    await SecureStore.setItemAsync(KEYS.REFRESH, refresh);
  },

  async getJWT(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.JWT);
  },

  async savePushToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.PUSH_TOKEN, token);
  },

  async getPushToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.PUSH_TOKEN);
  },

  async clearAuth(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.JWT);
    await SecureStore.deleteItemAsync(KEYS.REFRESH);
  },
};
