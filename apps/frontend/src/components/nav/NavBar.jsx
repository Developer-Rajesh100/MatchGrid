import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Trophy, Shield, LogOut, Lock, Menu, X, Activity } from 'lucide-react';
import { authApi } from '../../api/auth';
import { AUTH_CHANGED_EVENT } from '../../api/session';
import { useWebSocket } from '../../context/WebSocketContext';
import { TournamentSwitcher } from './TournamentSwitcher';

export function NavBar() {
  const [isAdmin, setIsAdmin] = useState(authApi.isAuthenticated());
  const [role, setRole] = useState(authApi.getRole());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isConnected } = useWebSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const inTournament = /^\/t\//.test(location.pathname);

  useEffect(() => {
    const handleAuthChange = () => {
      setIsAdmin(authApi.isAuthenticated());
      setRole(authApi.getRole());
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    window.addEventListener('storage', handleAuthChange); // sign-in/out in another tab
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    authApi.logout();
    setMobileMenuOpen(false);
    navigate('/');
  };

  const navLinks = [
    { to: '/', label: 'Tournaments', icon: Trophy, end: true },
  ];

  return (
    <>
      <div className="brand-topbar" />
      <header className="brand-nav">
        <div className="brand-nav-inner">
          {/* Logo & Wordmark */}
          <NavLink to="/" className="brand-logo-link">
            <img
              src="/brand/matchgrid-logo.png"
              alt="MatchGrid Logo"
              className="brand-logo-img"
            />
            <div className="brand-wordmark">
              <span className="brand-wordmark-title">
                Match<span>Grid</span>
              </span>
            </div>
          </NavLink>

          {/* The switcher only means something inside a tournament; elsewhere the "Tournaments" link is the hub entry */}
          {inTournament && <TournamentSwitcher />}

          {/* Desktop Navigation Tabs */}
          <nav className="brand-nav-tabs" aria-label="Main navigation">
            {navLinks.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `brand-nav-tab ${isActive ? 'active' : ''}`}
              >
                <Icon size={14} /> {label}
              </NavLink>
            ))}
          </nav>

          {/* Right Header: Connection Beacon & Admin Entry */}
          <div className="brand-nav-right">
            {/* Live WebSocket Status Indicator */}
            <div
              className={`connection-indicator ${isConnected ? 'online' : ''}`}
              role="status"
              aria-label={isConnected ? 'Live updates connected' : 'Reconnecting to live updates'}
              title={isConnected ? 'Live updates connected' : 'Reconnecting to live updates…'}
            >
              <span className="connection-dot" />
            </div>

            {isAdmin ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <NavLink
                  to={
                    role === 'SUPER_ADMIN'
                      ? '/superadmin'
                      : role === 'ORGANIZER'
                      ? '/organizer'
                      : role === 'SCORER'
                      ? '/scorer'
                      : '/login'
                  }
                  className={({ isActive }) =>
                    `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}`
                  }
                >
                  {role === 'SUPER_ADMIN' ? (
                    <Shield size={12} />
                  ) : role === 'ORGANIZER' ? (
                    <Trophy size={12} />
                  ) : role === 'SCORER' ? (
                    <Activity size={12} />
                  ) : (
                    <Lock size={12} />
                  )}{' '}
                  {role === 'SUPER_ADMIN'
                    ? 'Superadmin'
                    : role === 'ORGANIZER'
                    ? 'Organizer'
                    : role === 'SCORER'
                    ? 'Scorer'
                    : 'Admin'}
                </NavLink>
                <button
                  onClick={handleLogout}
                  className="btn btn-sm btn-danger"
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <NavLink
                to="/login"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '12px', padding: '5px 12px' }}
              >
                <Lock size={12} /> Portal Login
              </NavLink>
            )}

            {/* Mobile Hamburger Button */}
            <button
              className="mobile-nav-toggle"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay & Slideout Menu */}
      <div
        className={`mobile-drawer-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <aside className={`mobile-drawer ${mobileMenuOpen ? 'open' : ''}`} aria-label="Mobile navigation">
        <div className="mobile-drawer-header">
          <div className="brand-logo-link">
            <img src="/brand/matchgrid-logo.png" alt="MatchGrid" className="brand-logo-img" />
            <div className="brand-wordmark">
              <span className="brand-wordmark-title">
                Match<span>Grid</span>
              </span>
            </div>
          </div>
          <button
            className="mobile-drawer-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="mobile-drawer-links">
          {inTournament && (
            <div style={{ marginBottom: '12px' }}>
              <TournamentSwitcher />
            </div>
          )}
          {navLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}

          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            {isAdmin ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <NavLink
                  to={
                    role === 'SUPER_ADMIN'
                      ? '/superadmin'
                      : role === 'ORGANIZER'
                      ? '/organizer'
                      : role === 'SCORER'
                      ? '/scorer'
                      : '/login'
                  }
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {role === 'SUPER_ADMIN' ? (
                    <Shield size={14} />
                  ) : role === 'ORGANIZER' ? (
                    <Trophy size={14} />
                  ) : role === 'SCORER' ? (
                    <Activity size={14} />
                  ) : (
                    <Lock size={14} />
                  )}{' '}
                  {role === 'SUPER_ADMIN'
                    ? 'Superadmin Console'
                    : role === 'ORGANIZER'
                    ? 'Organizer Workspace'
                    : role === 'SCORER'
                    ? 'Scorer Cockpit'
                    : 'Admin Dashboard'}
                </NavLink>
                <button
                  onClick={handleLogout}
                  className="btn btn-danger"
                  style={{ width: '100%' }}
                >
                  <LogOut size={14} /> Logout
                </button>
              </div>
            ) : (
              <NavLink
                to="/login"
                className="btn btn-outline"
                style={{ width: '100%' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Lock size={14} /> Portal Login
              </NavLink>
            )}
          </div>
        </nav>
      </aside>
    </>
  );
}
export default NavBar;
