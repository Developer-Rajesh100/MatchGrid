import React from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoleGuard } from './RoleGuard';
import { authApi } from '../../api/auth';

describe('RoleGuard and Role-Aware Auth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects unauthenticated users to /admin/login', () => {
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
          <Route path="/admin/login" element={<div>Login Page</div>} />
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

  it('redirects to home when user role is not authorized', () => {
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
          <Route path="/" element={<div>Home Page Redirected</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Home Page Redirected')).toBeInTheDocument();
    expect(screen.queryByText('Superadmin Area')).not.toBeInTheDocument();
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
});
