import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

import type { Database } from '@/db/types';

type ExtraRecord = Record<string, unknown> | undefined;

function pickFromExtra(extra: ExtraRecord): { url?: string; anonKey?: string } {
  if (!extra || typeof extra !== 'object') return {};
  const url = extra.supabaseUrl;
  const anonKey = extra.supabaseAnonKey;
  return {
    url: typeof url === 'string' && url.length > 0 ? url : undefined,
    anonKey: typeof anonKey === 'string' && anonKey.length > 0 ? anonKey : undefined,
  };
}

function resolveSupabaseConfig(): { url?: string; anonKey?: string } {
  const fromExpoExtra = pickFromExtra(Constants.expoConfig?.extra as ExtraRecord);
  if (fromExpoExtra.url && fromExpoExtra.anonKey) return fromExpoExtra;

  const manifest = Constants.manifest as { extra?: unknown } | null | undefined;
  const fromManifest = pickFromExtra(manifest?.extra as ExtraRecord);
  if (fromManifest.url && fromManifest.anonKey) return fromManifest;

  const manifest2 = Constants.manifest2 as
    | { extra?: { expoClient?: { extra?: unknown } } }
    | null
    | undefined;
  const fromManifest2 = pickFromExtra(manifest2?.extra?.expoClient?.extra as ExtraRecord);
  if (fromManifest2.url && fromManifest2.anonKey) return fromManifest2;

  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;
  return { url, anonKey };
}

const { url, anonKey } = resolveSupabaseConfig();

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase URL or anon key. Add a project-root .env with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or VITE_/SUPABASE_ fallbacks — see app.config.ts), then restart Metro with a clean cache: npx expo start -c.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
