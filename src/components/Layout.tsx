import { useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { SunIcon, BookIcon, ActivityIcon, UserIcon } from './Icons';
import './Layout.css';

const navItems = [
  { to: '/', label: 'Today', icon: <SunIcon /> },
  { to: '/history', label: 'History', icon: <BookIcon /> },
  { to: '/progress', label: 'Progress', icon: <ActivityIcon /> },
  { to: '/profile', label: 'Profile', icon: <UserIcon /> },
] as const;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function Layout() {
  const location = useLocation();
  const hideNav = location.pathname.startsWith('/workout');
  return (
    <div className="layout">
      <ScrollToTop />
      <main className={'layout-main' + (hideNav ? ' layout-main--full' : '')}>
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>
      {!hideNav && (
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
      )}
    </div>
  );
}
