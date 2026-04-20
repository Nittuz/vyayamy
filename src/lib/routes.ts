import type { ReactNode } from 'react';
import { SunIcon, CalendarIcon, BookIcon, ActivityIcon, UserIcon } from '../components/Icons';
import { createElement } from 'react';

/**
 * Single source of truth for all application route paths.
 */
export const ROUTES = {
  login: '/login',

  today: '/',
  workoutActive: 'workout/active',

  plan: 'plan',
  planSetup: 'plan/setup',

  history: 'history',
  historyDetail: (id: string) => `history/${id}` as const,

  progress: 'progress',

  profile: 'profile',
  privacy: 'privacy',
} as const;

export type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
};

/** Primary bottom-tab navigation items (5 tabs). */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Today', icon: createElement(SunIcon), end: true },
  { to: '/plan', label: 'Plan', icon: createElement(CalendarIcon) },
  { to: '/history', label: 'History', icon: createElement(BookIcon) },
  { to: '/progress', label: 'Progress', icon: createElement(ActivityIcon) },
  { to: '/profile', label: 'Profile', icon: createElement(UserIcon) },
];
