import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  createNativeSupabaseClient,
  type SecureStoreLike,
} from '@huddle/api-client/native';

/**
 * Mobile Supabase client.
 *
 * Storage backend depends on platform:
 *   - iOS / Android: expo-secure-store (OS keychain / keystore)
 *   - Web (Expo web preview, or a future web target): localStorage,
 *     because expo-secure-store is native-only and throws
 *     "getValueWithKeyAsync is not a function" in a browser.
 *
 * Both backends conform to the SecureStoreLike interface the native
 * factory expects (async get/set/delete by key).
 */

const webStorage: SecureStoreLike = {
  async getItemAsync(key: string) {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  async setItemAsync(key: string, value: string) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  },
  async deleteItemAsync(key: string) {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  },
};

const nativeStorage: SecureStoreLike = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync,
};

export const supabase = createNativeSupabaseClient(
  Platform.OS === 'web' ? webStorage : nativeStorage,
);
