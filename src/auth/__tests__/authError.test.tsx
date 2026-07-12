/**
 * AuthProvider error surface (#94): reportAuthError flows from the module
 * store (the magic-link handler mounts outside the provider) into context
 * state, clears on demand, survives pre-mount reports, and clears itself
 * once a session exists.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useContext } from 'react';

import { AuthContext, AuthProvider, reportAuthError } from '../AuthContext';

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));
jest.mock('@/lib/errorReporting', () => ({
  setUser: jest.fn(),
  captureException: jest.fn(),
}));

const { supabase } = jest.requireMock('../supabase') as {
  supabase: { auth: { getSession: jest.Mock; onAuthStateChange: jest.Mock } };
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

function renderAuth() {
  return renderHook(() => useContext(AuthContext), { wrapper });
}

describe('AuthProvider authError', () => {
  test('starts null, surfaces reportAuthError, clears via clearAuthError', async () => {
    const { result, unmount } = renderAuth();
    await act(async () => {});
    expect(result.current.authError).toBeNull();

    act(() => reportAuthError('magic-link-failed'));
    expect(result.current.authError).toBe('magic-link-failed');

    act(() => result.current.clearAuthError());
    expect(result.current.authError).toBeNull();
    unmount();
  });

  test('an error reported before the provider mounts is visible after mount', async () => {
    reportAuthError('magic-link-failed');
    const { result, unmount } = renderAuth();
    await act(async () => {});
    expect(result.current.authError).toBe('magic-link-failed');

    act(() => result.current.clearAuthError());
    unmount();
  });

  test('a session arrival clears a pending auth error', async () => {
    const { result, unmount } = renderAuth();
    await act(async () => {});
    act(() => reportAuthError('magic-link-failed'));
    expect(result.current.authError).toBe('magic-link-failed');

    const lastCall = supabase.auth.onAuthStateChange.mock.calls.at(-1) as unknown[];
    const onChange = lastCall[0] as (event: string, session: unknown) => void;
    const fakeSession = { user: { id: 'u1' } };
    act(() => onChange('SIGNED_IN', fakeSession));

    expect(result.current.session).toBe(fakeSession);
    expect(result.current.user).toEqual({ id: 'u1' });
    expect(result.current.authError).toBeNull();
    unmount();
  });
});
