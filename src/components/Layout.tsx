import { Outlet, NavLink } from 'react-router-dom';
import { SunIcon, BookIcon, ActivityIcon, UserIcon } from './Icons';
import './Layout.css';

const navItems = [
  { to: '/', label: 'Today', icon: <SunIcon /> },
  { to: '/history', label: 'History', icon: <BookIcon /> },
  { to: '/progress', label: 'Progress', icon: <ActivityIcon /> },
  { to: '/profile', label: 'Profile', icon: <UserIcon /> },
] as const;

export function Layout() {
  return (
    <div className="layout">
      <main className="layout-main">
        <Outlet />
      </main>
      <nav className="layout-nav" aria-label="Primary">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              'layout-nav-link' + (isActive ? ' layout-nav-link--active' : '')
            }
            end={to === '/'}
          >
            <span className="layout-nav-icon">{icon}</span>
            <span className="layout-nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
