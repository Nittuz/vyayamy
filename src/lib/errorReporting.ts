import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let initialized = false;

export function initErrorReporting(): void {
  if (initialized) return;
  const dsn = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn;
  if (!dsn) return;

  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    // Tracing is non-zero only in production; dev runs add cost without value
    // (test runs are noisy on release-health sampling).
    tracesSampleRate: __DEV__ ? 0 : 0.1,
    debug: __DEV__,
    environment: __DEV__ ? 'development' : 'production',
    // Off by default — we set the user id explicitly in AuthContext (no email,
    // no IP, no headers). PII inclusion would otherwise pull request headers,
    // request bodies, and IP addresses into every event.
    sendDefaultPii: false,
    // Magic-link callbacks include a single-use auth code in the URL fragment.
    // Even single-use, it shouldn't end up in an indexed crash log.
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === 'navigation' || breadcrumb.category === 'fetch') {
        const data = breadcrumb.data as Record<string, unknown> | undefined;
        if (data && typeof data.url === 'string') {
          breadcrumb.data = { ...data, url: scrubUrl(data.url) };
        }
        if (data && typeof data.to === 'string') {
          breadcrumb.data = { ...breadcrumb.data, to: scrubUrl(data.to) };
        }
      }
      return breadcrumb;
    },
    beforeSend: (event) => {
      if (event.request?.url) {
        event.request.url = scrubUrl(event.request.url);
      }
      return event;
    },
  });
  initialized = true;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function setUser(user: { id: string } | null): void {
  if (!initialized) return;
  Sentry.setUser(user);
}

/** Strip query strings from URLs — they may carry PII or single-use auth codes. */
function scrubUrl(url: string): string {
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  const cut = Math.min(...[q, h].filter((i) => i >= 0));
  return Number.isFinite(cut) && cut >= 0 ? url.slice(0, cut) : url;
}
