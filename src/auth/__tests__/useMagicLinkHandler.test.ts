/**
 * Magic-link deep-link handling (#94): the exchange's returned error and its
 * throw path both surface through reportAuthError instead of vanishing into
 * a silent catch, and success still routes home.
 */
import { act, renderHook } from '@testing-library/react-native';

import { useMagicLinkHandler } from '../useMagicLinkHandler';

jest.mock('expo-linking', () => ({
  parse: jest.fn((url: string) => {
    const code = new URL(url).searchParams.get('code');
    return { queryParams: code ? { code } : {} };
  }),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(async () => null),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('../AuthContext', () => ({ reportAuthError: jest.fn() }));
jest.mock('../authActions', () => ({ exchangeCodeForSession: jest.fn() }));
jest.mock('@/lib/errorReporting', () => ({ captureException: jest.fn() }));

const linking = jest.requireMock('expo-linking') as {
  addEventListener: jest.Mock;
  getInitialURL: jest.Mock;
};
const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
const { reportAuthError } = jest.requireMock('../AuthContext') as { reportAuthError: jest.Mock };
const { exchangeCodeForSession } = jest.requireMock('../authActions') as {
  exchangeCodeForSession: jest.Mock;
};
const { captureException } = jest.requireMock('@/lib/errorReporting') as {
  captureException: jest.Mock;
};

/** Mount the hook and return an emitter for the captured `url` listener. */
function mountHandler() {
  const rendered = renderHook(() => useMagicLinkHandler());
  const lastCall = linking.addEventListener.mock.calls.at(-1) as unknown[];
  const listener = lastCall[1] as (event: { url: string }) => void;
  const emit = async (url: string) => {
    await act(async () => {
      listener({ url });
    });
  };
  return { ...rendered, emit };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useMagicLinkHandler', () => {
  test('successful exchange routes home and reports nothing', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const { emit, unmount } = mountHandler();

    await emit('flexyug://login?code=good');

    expect(exchangeCodeForSession).toHaveBeenCalledWith('good');
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(reportAuthError).not.toHaveBeenCalled();
    unmount();
  });

  test('a returned exchange error surfaces as magic-link-failed', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'code expired' } });
    const { emit, unmount } = mountHandler();

    await emit('flexyug://login?code=stale');

    expect(reportAuthError).toHaveBeenCalledWith('magic-link-failed');
    expect(router.replace).not.toHaveBeenCalled();
    unmount();
  });

  test('a thrown exchange failure is captured and surfaced', async () => {
    exchangeCodeForSession.mockRejectedValue(new Error('network down'));
    const { emit, unmount } = mountHandler();

    await emit('flexyug://login?code=any');

    expect(captureException).toHaveBeenCalled();
    expect(reportAuthError).toHaveBeenCalledWith('magic-link-failed');
    expect(router.replace).not.toHaveBeenCalled();
    unmount();
  });

  test('a URL without a code is ignored', async () => {
    const { emit, unmount } = mountHandler();

    await emit('flexyug://login');

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(reportAuthError).not.toHaveBeenCalled();
    unmount();
  });

  test('the initial launch URL is consumed once', async () => {
    linking.getInitialURL.mockResolvedValueOnce('flexyug://login?code=cold-start');
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { unmount } = renderHook(() => useMagicLinkHandler());
    await act(async () => {});

    expect(exchangeCodeForSession).toHaveBeenCalledWith('cold-start');
    expect(router.replace).toHaveBeenCalledWith('/');
    unmount();
  });
});
