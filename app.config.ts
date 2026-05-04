import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { ExpoConfig } from 'expo/config';

// Load all common .env filenames from the project root so app.config `extra` sees
// EXPO_PUBLIC_*, VITE_*, etc. (Expo does not always inject non-EXPO vars into this process.)
const _envRoot = process.cwd();
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  loadDotenv({ path: path.join(_envRoot, name), override: true });
}

const config: ExpoConfig = {
  name: 'Vyayamy',
  slug: 'vyayamy',
  scheme: 'vyayamy',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#FAFAF9',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.mokshlabs.vyayamy',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['fetch'],
    },
  },
  android: {
    package: 'com.mokshlabs.vyayamy',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FAFAF9',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#0F172A',
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Prefer EXPO_PUBLIC_* (Expo), then VITE_* (legacy web), then unprefixed Supabase CLI names.
    supabaseUrl:
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      process.env.VITE_SUPABASE_URL ??
      process.env.SUPABASE_URL,
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.VITE_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
