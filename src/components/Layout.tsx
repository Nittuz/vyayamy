import { useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../lib/routes';
import { OfflineBanner } from './OfflineBanner';
import './Layout.css';

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
      <OfflineBanner />
      <ScrollToTop />
      <main className={'layout-main' + (hideNav ? ' layout-main--full' : '')}>
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>
      {!hideNav && (
        <nav className="layout-nav" aria-label="Primary">
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                'layout-nav-link' + (isActive ? ' layout-nav-link--active' : '')
              }
              end={end}
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
