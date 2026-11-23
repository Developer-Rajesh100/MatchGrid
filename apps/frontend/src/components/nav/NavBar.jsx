import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Trophy, Shield, Calendar, Users, BarChart3, LogOut, Lock } from 'lucide-react';
import { authApi } from '../../api/auth';

export function NavBar() {
  const [isAdmin, setIsAdmin] = useState(authApi.isAuthenticated());
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthChange = () => {
      setIsAdmin(authApi.isAuthenticated());
    };
    window.addEventListener('dcl-auth-changed', handleAuthChange);
    return () => window.removeEventListener('dcl-auth-changed', handleAuthChange);
  }, []);

  const handleLogout = () => {
    authApi.logout();
    navigate('/');
  };

  return (
    <>
      <div className="dcl-topbar"></div>
      <header className="dcl-nav">
        <div className="dcl-nav-inner">
          <NavLink to="/" className="dcl-logo">
            <span className="dcl-logo-title">
              <Trophy size={20} color="var(--amber)" /> DCL
            </span>
            <span className="dcl-logo-subtitle">SEASON 5</span>
          </NavLink>

          <nav className="dcl-tabs" aria-label="Main navigation">
            <NavLink to="/" end className={({ isActive }) => `dcl-tab ${isActive ? 'active' : ''}`}>
              Home
            </NavLink>
            <NavLink to="/matches" className={({ isActive }) => `dcl-tab ${isActive ? 'active' : ''}`}>
              <Calendar size={14} /> Matches
            </NavLink>
            <NavLink to="/standings" className={({ isActive }) => `dcl-tab ${isActive ? 'active' : ''}`}>
              <BarChart3 size={14} /> Standings
            </NavLink>
            <NavLink to="/stats" className={({ isActive }) => `dcl-tab ${isActive ? 'active' : ''}`}>
              <Trophy size={14} /> Stats
            </NavLink>
            <NavLink to="/teams" className={({ isActive }) => `dcl-tab ${isActive ? 'active' : ''}`}>
              <Shield size={14} /> Teams
            </NavLink>
            <NavLink to="/players" className={({ isActive }) => `dcl-tab ${isActive ? 'active' : ''}`}>
              <Users size={14} /> Players
            </NavLink>
          </nav>

          <div className="dcl-nav-right">
            {isAdmin ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}`
                  }
                >
                  <Lock size={12} /> Admin
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
                style={{ fontSize: '12px', padding: '5px 10px' }}
              >
                <Lock size={12} /> Admin
              </NavLink>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
