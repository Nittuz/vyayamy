/* Test setup — Node-side mocks for packages that normally require a
 * React Native runtime. The sync engine and its tests are pure TS so
 * this is enough to run everything under ts-jest + better-sqlite3. */

// The America/New_York timezone pin lives in jest.globalSetup.js: it has no
// effect from here because this file runs inside Jest's sandbox, where
// process.env is a clone the real environment never sees.
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => {}),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: 26, select: (spec) => spec.ios },
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  init: jest.fn(),
  setUser: jest.fn(),
}));
