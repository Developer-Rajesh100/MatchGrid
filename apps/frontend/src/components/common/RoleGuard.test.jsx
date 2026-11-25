import React from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoleGuard } from './RoleGuard';
import { authApi } from '../../api/auth';

describe('RoleGuard and Role-Aware Auth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects unauthenticated users to /login', () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                <div>Secret Content</div>
              </RoleGuard>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('renders content when user has the allowed role', () => {
    localStorage.setItem('matchgrid_admin_token', 'test-token');
    localStorage.setItem('matchgrid_role', 'ORGANIZER');

    render(
      <MemoryRouter initialEntries={['/organizer-dashboard']}>
        <Routes>
          <Route
            path="/organizer-dashboard"
            element={
              <RoleGuard allowedRoles={['ORGANIZER', 'SUPER_ADMIN']}>
                <div>Organizer Dashboard Content</div>
              </RoleGuard>
            }
          />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Organizer Dashboard Content')).toBeInTheDocument();
  });

  it('shows a 403 screen (not a silent redirect) when the role is not authorized', () => {
    localStorage.setItem('matchgrid_admin_token', 'test-token');
    localStorage.setItem('matchgrid_role', 'SCORER');

    render(
      <MemoryRouter initialEntries={['/superadmin-only']}>
        <Routes>
          <Route
            path="/superadmin-only"
            element={
              <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                <div>Superadmin Area</div>
              </RoleGuard>
            }
          />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('forbidden-state')).toHaveTextContent(/403/);
    expect(screen.getByRole('link', { name: /go to my workspace/i })).toHaveAttribute('href', '/scorer');
    expect(screen.queryByText('Superadmin Area')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });

  it('never treats a token without a stored role as a super admin', () => {
    localStorage.setItem('matchgrid_admin_token', 'old-token'); // legacy session: no role stored
    expect(authApi.getRole()).toBe('');
    expect(authApi.hasRole(['SUPER_ADMIN'])).toBe(false);

    render(
      <MemoryRouter initialEntries={['/superadmin-only']}>
        <Routes>
          <Route
            path="/superadmin-only"
            element={
              <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                <div>Superadmin Area</div>
              </RoleGuard>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Superadmin Area')).not.toBeInTheDocument();
  });

  it('redirects to /login live when a 401 clears the session while the page is open', () => {
    localStorage.setItem('matchgrid_admin_token', 'test-token');
    localStorage.setItem('matchgrid_role', 'ORGANIZER');

    render(
      <MemoryRouter initialEntries={['/organizer']}>
        <Routes>
          <Route
            path="/organizer"
            element={
              <RoleGuard allowedRoles={['ORGANIZER']}>
                <div>Organizer Area</div>
              </RoleGuard>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Organizer Area')).toBeInTheDocument();

    act(() => {
      // exactly what api/client.js does on a 401
      localStorage.removeItem('matchgrid_admin_token');
      localStorage.removeItem('matchgrid_role');
      window.dispatchEvent(new Event('matchgrid-auth-changed'));
    });
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('correctly reports role methods on authApi', () => {
    localStorage.setItem('matchgrid_admin_token', 'token');
    localStorage.setItem('matchgrid_role', 'ORGANIZER');
    localStorage.setItem('matchgrid_user_id', 'usr123');

    expect(authApi.getRole()).toBe('ORGANIZER');
    expect(authApi.getUserId()).toBe('usr123');
    expect(authApi.isOrganizer()).toBe(true);
    expect(authApi.isSuperAdmin()).toBe(false);
    expect(authApi.isScorer()).toBe(false);
    expect(authApi.hasRole(['ORGANIZER', 'SUPER_ADMIN'])).toBe(true);
    expect(authApi.hasRole(['SCORER'])).toBe(false);

    authApi.logout();
    expect(authApi.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('matchgrid_role')).toBeNull();
    expect(localStorage.getItem('matchgrid_user_id')).toBeNull();
  });

  it('sends a deliberate logout home, not to a "session expired" login', () => {
    localStorage.setItem('matchgrid_admin_token', 'test-token');
    localStorage.setItem('matchgrid_role', 'ORGANIZER');

    render(
      <MemoryRouter initialEntries={['/organizer']}>
        <Routes>
          <Route
            path="/organizer"
            element={
              <RoleGuard allowedRoles={['ORGANIZER']}>
                <div>Organizer Area</div>
              </RoleGuard>
            }
          />
          <Route path="/" element={<div>Home Page</div>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    act(() => {
      authApi.logout(); // what the nav bar's Logout button calls
    });
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
