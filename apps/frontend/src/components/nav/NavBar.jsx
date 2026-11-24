import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Trophy, Shield, Calendar, Users, BarChart3, LogOut, Lock, Menu, X, Activity } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useWebSocket } from '../../context/WebSocketContext';
import { TournamentSwitcher } from './TournamentSwitcher';

export function NavBar() {
  const [isAdmin, setIsAdmin] = useState(authApi.isAuthenticated());
  const [role, setRole] = useState(authApi.getRole());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isConnected } = useWebSocket();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleAuthChange = () => {
      setIsAdmin(authApi.isAuthenticated());
      setRole(authApi.getRole());
    };
    window.addEventListener('matchgrid-auth-changed', handleAuthChange);
    window.addEventListener('dcl-auth-changed', handleAuthChange);
    return () => {
      window.removeEventListener('matchgrid-auth-changed', handleAuthChange);
      window.removeEventListener('dcl-auth-changed', handleAuthChange);
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
    { to: '/', label: 'Home', icon: Trophy, end: true },
    { to: '/matches', label: 'Matches', icon: Calendar },
    { to: '/standings', label: 'Standings', icon: BarChart3 },
    { to: '/stats', label: 'Stats', icon: Trophy },
    { to: '/teams', label: 'Teams', icon: Shield },
    { to: '/players', label: 'Players', icon: Users },
  ];

  return (
    <>
      <div className="brand-topbar" />
      <header className="brand-nav">
        <div className="brand-nav-inner">
          {/* Logo & Wordmark */}
          <NavLink to="/" className="brand-logo-link">
            <img
              src="/assets/brand/matchgrid-logo.png"
              alt="MatchGrid Logo"
              className="brand-logo-img"
            />
            <div className="brand-wordmark">
              <span className="brand-wordmark-title">
                Match<span>Grid</span>
              </span>
              <span className="brand-wordmark-tag">Live Tournament Center</span>
            </div>
          </NavLink>

          {/* Quick Tournament Switcher Dropdown */}
          <TournamentSwitcher />

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
              title={isConnected ? 'Live WebSocket connection active' : 'Connecting to live socket...'}
            >
              <span className="connection-dot" />
              <span>{isConnected ? 'LIVE' : 'SYNCING'}</span>
            </div>

            {isAdmin ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <NavLink
                  to={role === 'SCORER' ? '/scorer' : '/admin'}
                  className={({ isActive }) =>
                    `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}`
                  }
                >
                  <Lock size={12} /> {role === 'SCORER' ? 'Scorer' : 'Admin'}
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
                to="/admin/login"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '12px', padding: '5px 12px' }}
              >
                <Lock size={12} /> Admin
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
            <img src="/assets/brand/matchgrid-logo.png" alt="MatchGrid" className="brand-logo-img" />
            <div className="brand-wordmark">
              <span className="brand-wordmark-title">
                Match<span>Grid</span>
              </span>
              <span className="brand-wordmark-tag">Live Tournament Center</span>
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
          <div style={{ marginBottom: '12px' }}>
            <TournamentSwitcher />
          </div>
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
                  to={role === 'SCORER' ? '/scorer' : '/admin'}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Lock size={14} /> {role === 'SCORER' ? 'Scorer Cockpit' : 'Admin Dashboard'}
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
                to="/admin/login"
                className="btn btn-outline"
                style={{ width: '100%' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Lock size={14} /> Admin Portal Login
              </NavLink>
            )}
          </div>
        </nav>
      </aside>
    </>
  );
}
export default NavBar;
