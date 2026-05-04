import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import './Login.css';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user, signInWithOtp } = useAuth();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from
      ?.pathname ?? '/';

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signInWithOtp(email.trim());
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-header">
          <div className="login-monogram" aria-hidden="true">V</div>
          <h1 className="login-title">Vyayamy</h1>
          <p className="login-tagline">Track your training, with less noise.</p>
        </div>

        {sent ? (
          <div className="login-sent">
            <svg
              className="login-sent-icon"
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="20" cy="20" r="20" fill="var(--color-success-soft)" />
              <path
                d="M14 20.5L18 24.5L26 16.5"
                stroke="var(--color-success)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="login-sent-heading">Check your email</p>
            <p className="login-sent-text">
              We sent a sign-in link to <strong>{email}</strong>
            </p>
            <p className="meta">You can close this tab after signing in.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="email" className="login-label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input input--lg"
                required
                disabled={loading}
              />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button
              type="submit"
              className="btn-primary login-button"
              disabled={loading}
            >
              {loading ? (
                <span className="login-spinner" aria-label="Sending" />
              ) : (
                'Send magic link'
              )}
            </button>
            <p className="login-hint">We'll email you a secure sign-in link.</p>
          </form>
        )}

      </div>
    </div>
  );
}
