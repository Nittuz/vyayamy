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
  name: 'FlexYug',
  slug: 'flexyug',
  scheme: 'flexyug',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.mokshlabs.flexyug',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['fetch'],
      // Mic + speech usage strings come from the expo-speech-recognition config
      // plugin below (microphonePermission / speechRecognitionPermission).
    },
  },
  android: {
    package: 'com.mokshlabs.flexyug',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0E1411',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/icon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#0E1411',
      },
    ],
    'expo-sqlite',
    'expo-status-bar',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#D8AB92',
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission:
          'FlexYug uses the microphone to log sets by voice during a workout.',
        speechRecognitionPermission:
          'FlexYug uses speech recognition to understand your workout commands.',
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
