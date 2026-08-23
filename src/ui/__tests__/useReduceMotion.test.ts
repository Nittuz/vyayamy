/**
 * useReduceMotion (impeccable r2 #I3): the one hook every animated primitive
 * should source its Reduce Motion read from — live subscription, cleaned up
 * on unmount, and a module-level cache so a component that remounts often
 * (an ActiveSetCard per logged set) gets the already-known value on its very
 * first render instead of guessing `false` for a frame.
 *
 * The hook's module-level cache is intentionally NOT reset between tests
 * (there is no seam to reset it through, and it shouldn't need one — the
 * real app never resets it either). Tests are written in a deliberate order
 * that both exercises and relies on that persistence, the same way multiple
 * consumers mounting across a real session would.
 */
import { act, renderHook } from '@testing-library/react-native';

import { useReduceMotion } from '../useReduceMotion';

type ChangeHandler = (r: boolean) => void;

jest.mock('react-native', () => {
  const listeners: ChangeHandler[] = [];
  return {
    Platform: { OS: 'ios', select: (spec: { ios: unknown }) => spec.ios },
    AccessibilityInfo: {
      isReduceMotionEnabled: jest.fn(),
      addEventListener: jest.fn((_event: string, handler: (r: boolean) => void) => {
        listeners.push(handler);
        const remove = jest.fn(() => {
          const i = listeners.indexOf(handler);
          if (i >= 0) listeners.splice(i, 1);
        });
        return { remove };
      }),
      __listeners: listeners,
    },
  };
});

const { AccessibilityInfo } = jest.requireMock('react-native') as {
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.Mock;
    addEventListener: jest.Mock;
    __listeners: ChangeHandler[];
  };
};

function emit(r: boolean) {
  for (const l of AccessibilityInfo.__listeners) l(r);
}

describe('useReduceMotion', () => {
  // Every mount's effect re-fetches regardless of the cached initial value
  // (only the initial render benefits from the cache), so every renderHook
  // in this file needs a resolvable default even when a test's assertions
  // only care about the synchronous initial value.
  beforeEach(() => {
    AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
  });

  test('the first-ever mount defaults to false, then resolves to the real async value', async () => {
    const { result, unmount } = renderHook(() => useReduceMotion());
    expect(result.current).toBe(false);

    await act(async () => {});
    expect(result.current).toBe(true);
    unmount();
  });

  test('a later mount reuses the value an earlier one already resolved — no default-false frame', () => {
    // No `act` await below: the synchronous initial render must already
    // reflect the prior test's resolved `true` from the shared module-level
    // cache, before this mount's own re-fetch has had a chance to settle.
    const { result, unmount } = renderHook(() => useReduceMotion());
    expect(result.current).toBe(true);
    unmount();
  });

  test('a live reduceMotionChanged event updates every mounted consumer', async () => {
    const { result, unmount } = renderHook(() => useReduceMotion());
    await act(async () => {});

    await act(async () => {
      emit(false);
    });
    expect(result.current).toBe(false);

    await act(async () => {
      emit(true);
    });
    expect(result.current).toBe(true);
    unmount();
  });

  test('unmount removes the reduceMotionChanged subscription', async () => {
    const beforeCalls = AccessibilityInfo.addEventListener.mock.results.length;
    const { unmount } = renderHook(() => useReduceMotion());
    await act(async () => {});

    const { remove } = AccessibilityInfo.addEventListener.mock.results[beforeCalls]!.value as {
      remove: jest.Mock;
    };
    expect(remove).not.toHaveBeenCalled();

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('a rejected read resolves to false, overwriting any stale cache', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockRejectedValueOnce(new Error('unavailable'));

    const { result, unmount } = renderHook(() => useReduceMotion());
    await act(async () => {});
    expect(result.current).toBe(false);
    unmount();

    // The rejection also corrected the shared cache: a fresh mount right
    // after sees `false` synchronously too, even though beforeEach's default
    // mock (which this second mount's own re-fetch will use) resolves true.
    const second = renderHook(() => useReduceMotion());
    expect(second.result.current).toBe(false);
    second.unmount();
  });
});
