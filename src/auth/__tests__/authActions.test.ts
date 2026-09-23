/**
 * verifyEmailOtp is the sign-in-code half of the magic-link email: the same
 * email carries a link (same-device only) and a six-digit code that works
 * from any mail client on any device. The facade must call GoTrue's email OTP
 * verification, never the SMS/phone variants.
 */
import { verifyEmailOtp } from '@/auth/authActions';

jest.mock('@/auth/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: jest.fn(async () => ({ data: { session: null }, error: null })),
    },
  },
}));

const { supabase } = jest.requireMock('@/auth/supabase') as {
  supabase: { auth: { verifyOtp: jest.Mock } };
};

describe('verifyEmailOtp', () => {
  test('verifies the code as an email OTP for that address', async () => {
    await verifyEmailOtp('me@example.com', '123456');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'me@example.com',
      token: '123456',
      type: 'email',
    });
  });

  test('returns GoTrue’s result untouched so callers see the error', async () => {
    supabase.auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'bad' },
    });
    const result = await verifyEmailOtp('me@example.com', '000000');
    expect(result.error).toEqual({ message: 'bad' });
  });
});
