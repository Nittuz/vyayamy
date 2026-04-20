import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './EmptyState.css';

type EmptyStateProps = {
  icon: ReactNode;
  message: string;
  secondaryMessage?: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, message, secondaryMessage, actionLabel, actionTo, onAction }: EmptyStateProps) {
  return (
    <div className="card card--empty empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="empty-state-message">{message}</p>
      {secondaryMessage && (
        <p className="empty-state-secondary">{secondaryMessage}</p>
      )}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn-primary empty-state-action">
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button type="button" className="btn-primary empty-state-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function DumbbellIllustration() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="18" width="6" height="12" rx="2" />
      <rect x="38" y="18" width="6" height="12" rx="2" />
      <rect x="10" y="14" width="4" height="20" rx="1.5" />
      <rect x="34" y="14" width="4" height="20" rx="1.5" />
      <line x1="14" y1="24" x2="34" y2="24" />
    </svg>
  );
}

export function ChartIllustration() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 36 18 26 26 30 40 16" />
      <polyline points="34 16 40 16 40 22" />
      <line x1="8" y1="40" x2="40" y2="40" />
    </svg>
  );
}

export function CalendarIllustration() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="12" width="32" height="28" rx="3" />
      <line x1="8" y1="20" x2="40" y2="20" />
      <line x1="16" y1="8" x2="16" y2="16" />
      <line x1="32" y1="8" x2="32" y2="16" />
      <line x1="16" y1="28" x2="16" y2="28" strokeWidth="3" />
      <line x1="24" y1="28" x2="24" y2="28" strokeWidth="3" />
      <line x1="32" y1="28" x2="32" y2="28" strokeWidth="3" />
    </svg>
  );
}

export function TrophyIllustration() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8h16v14a8 8 0 01-16 0V8z" />
      <path d="M16 14H10a4 4 0 010-8h6" />
      <path d="M32 14h6a4 4 0 000-8h-6" />
      <line x1="24" y1="30" x2="24" y2="36" />
      <rect x="16" y="36" width="16" height="4" rx="2" />
    </svg>
  );
}
