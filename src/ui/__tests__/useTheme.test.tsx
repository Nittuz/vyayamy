/**
 * ThemeScope pins useTheme() to a fixed scheme for a subtree, regardless of
 * the system setting — the mechanism behind Login's dark poster (it's brand
 * chrome, not content). Every existing useTheme() call site must be
 * unaffected when no ThemeScope ancestor is mounted (additive-only), and the
 * override must never leak into a tree that isn't wrapped in one.
 */
import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import { ThemeScope, useTheme } from '@/ui/useTheme';

// jest.setup.js's global 'react-native' mock only exposes Platform — extend
// it here with useColorScheme rather than jest.requireActual, which would
// pull in react-native's real (Flow-syntax) entry point that ts-jest can't
// parse.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: 26, select: (spec: Record<string, unknown>) => spec.ios },
  useColorScheme: jest.fn(),
}));

const mockUseColorScheme = useColorScheme as jest.Mock;

describe('useTheme scheme resolution', () => {
  test('follows the system scheme when no ThemeScope is mounted', () => {
    mockUseColorScheme.mockReturnValue('light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');
  });

  test('defaults to dark for any non-light system value (existing behavior)', () => {
    mockUseColorScheme.mockReturnValue(null);
    const { result } = renderHook(() => useTheme());
    expect(result.current.scheme).toBe('dark');
  });

  test('ThemeScope pins the scheme regardless of the system setting', () => {
    mockUseColorScheme.mockReturnValue('light');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeScope scheme="dark">{children}</ThemeScope>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.scheme).toBe('dark');
    expect(result.current.color.bg).toBe('#121212');
  });

  test('the override never leaks into a tree with no ThemeScope ancestor', () => {
    // Rendered right after a ThemeScope-pinned tree above — a plain useTheme()
    // call elsewhere in the app must still track the system scheme, proving
    // the pin is scoped to its own subtree and not module/global state.
    mockUseColorScheme.mockReturnValue('light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');
  });
});
