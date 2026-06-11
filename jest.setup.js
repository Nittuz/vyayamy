/* Test setup — Node-side mocks for packages that normally require a
 * React Native runtime. The sync engine and its tests are pure TS so
 * this is enough to run everything under ts-jest + better-sqlite3. */

// Pin a non-UTC timezone so day/calendar logic is exercised under real offset
// conditions instead of silently passing because the CI box happens to be UTC
// (#152). America/New_York has a meaningful negative offset and observes DST.
process.env.TZ = 'America/New_York';
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
