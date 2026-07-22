import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env'
  );
}

/**
 * Expo web SSR runs in Node (no `window`). AsyncStorage / localStorage both
 * throw there, so use an in-memory store on the server and real storage on
 * the client / native.
 */
function createAuthStorage(): SupportedStorage {
  // Server-side render (expo start --web / static export)
  if (typeof window === 'undefined') {
    const memory = new Map<string, string>();
    return {
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => {
        memory.set(key, value);
      },
      removeItem: async (key) => {
        memory.delete(key);
      },
    };
  }

  // Browser
  if (Platform.OS === 'web') {
    return {
      getItem: (key) => {
        try {
          return Promise.resolve(window.localStorage.getItem(key));
        } catch {
          return Promise.resolve(null);
        }
      },
      setItem: (key, value) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* private mode / quota */
        }
        return Promise.resolve();
      },
      removeItem: (key) => {
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
        return Promise.resolve();
      },
    };
  }

  // iOS / Android — lazy-require so Node SSR never evaluates AsyncStorage
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  return AsyncStorage;
}

/**
 * Supabase client for Auth (and only Auth from the mobile app).
 * Habits data goes through the Express API with the access token.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createAuthStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web' && typeof window !== 'undefined',
  },
});

export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('YOUR_PROJECT') &&
      !supabaseAnonKey.includes('YOUR_')
  );
}
