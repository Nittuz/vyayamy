import path from 'node:path';

import { config as loadDotenv } from 'dotenv';
import type { ExpoConfig } from 'expo/config';

// Single source of truth for brand colors — a pure-constants module (no RN
// imports), so it is safe to evaluate in the Node config context. The explicit
// .ts extension is required: Expo transpiles only this entry file, and the
// child require is resolved by Node itself (whose type stripping needs the
// real extension).
import { darkPalette, lightPalette } from './src/ui/colors.ts';

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
  // Kills the white cold-start flash before the splash/boot overlay paints.
  backgroundColor: darkPalette.bg,
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.mokshlabs.flexyug',
    // iOS 18 home-screen variants: full-color default, dark, and a grayscale
    // tinted layer the system recolors.
    icon: {
      light: './assets/icon.png',
      dark: './assets/icon-dark.png',
      tinted: './assets/icon-tinted.png',
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // No UIBackgroundModes: sync runs on foreground (AppState) triggers, not a
      // registered background-fetch task. Declaring 'fetch' without one is an App
      // Review rejection risk (#122).
      // Mic + speech usage strings come from the expo-speech-recognition config
      // plugin below (microphonePermission / speechRecognitionPermission).
    },
  },
  // iOS-only stance for now (no `android` npm script, no Android build
  // pipeline) — kept, not deleted, so Android stays a config-only flip if we
  // ever pick it back up (impeccable batch 5).
  android: {
    package: 'com.mokshlabs.flexyug',
    backgroundColor: darkPalette.bg,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-mono.png',
      backgroundColor: darkPalette.bg,
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
        image: './assets/splash-light.png',
        resizeMode: 'contain',
        backgroundColor: lightPalette.bg,
        dark: {
          image: './assets/splash-dark.png',
          backgroundColor: darkPalette.bg,
        },
      },
    ],
    'expo-sqlite',
    'expo-status-bar',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: darkPalette.accent,
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
        microphonePermission: 'FlexYug uses the microphone to log sets by voice during a workout.',
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
