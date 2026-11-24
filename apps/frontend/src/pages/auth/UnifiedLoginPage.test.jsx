import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { UnifiedLoginPage } from './UnifiedLoginPage';
import { authApi } from '../../api/auth';

vi.mock('../../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    isAuthenticated: vi.fn().mockReturnValue(false),
    getRole: vi.fn().mockReturnValue(null),
    getUsername: vi.fn().mockReturnValue(null),
  },
}));

describe('UnifiedLoginPage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders login form elements and brand header', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<UnifiedLoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('portal-login-title')).toBeInTheDocument();
    expect(screen.getByTestId('admin-username-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-login-submit')).toBeInTheDocument();
  });

  it('redirects SUPER_ADMIN to /superadmin on successful login', async () => {
    authApi.login.mockResolvedValueOnce({
      access_token: 'fake-super-token',
      role: 'SUPER_ADMIN',
      username: 'rootadmin',
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<UnifiedLoginPage />} />
          <Route path="/superadmin" element={<div data-testid="superadmin-landing">Superadmin Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('admin-username-input'), { target: { value: 'rootadmin' } });
    fireEvent.change(screen.getByTestId('admin-password-input'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByTestId('admin-login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('superadmin-landing')).toBeInTheDocument();
    });
  });

  it('redirects ORGANIZER to /organizer on successful login', async () => {
    authApi.login.mockResolvedValueOnce({
      access_token: 'fake-org-token',
      role: 'ORGANIZER',
      username: 'cup_organizer',
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<UnifiedLoginPage />} />
          <Route path="/organizer" element={<div data-testid="organizer-landing">Organizer Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('admin-username-input'), { target: { value: 'cup_organizer' } });
    fireEvent.change(screen.getByTestId('admin-password-input'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByTestId('admin-login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('organizer-landing')).toBeInTheDocument();
    });
  });

  it('redirects SCORER to /scorer on successful login', async () => {
    authApi.login.mockResolvedValueOnce({
      access_token: 'fake-scorer-token',
      role: 'SCORER',
      username: 'match_scorer',
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<UnifiedLoginPage />} />
          <Route path="/scorer" element={<div data-testid="scorer-landing">Scorer Cockpit</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('admin-username-input'), { target: { value: 'match_scorer' } });
    fireEvent.change(screen.getByTestId('admin-password-input'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByTestId('admin-login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('scorer-landing')).toBeInTheDocument();
    });
  });

  it('maintains backward compatibility by redirecting to /admin when logging in at /admin/login', async () => {
    authApi.login.mockResolvedValueOnce({
      access_token: 'fake-token',
      role: 'SUPER_ADMIN',
      username: 'legacy_admin',
    });

    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <Routes>
          <Route path="/admin/login" element={<UnifiedLoginPage />} />
          <Route path="/admin" element={<div data-testid="legacy-admin-landing">Legacy Admin Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('admin-username-input'), { target: { value: 'legacy_admin' } });
    fireEvent.change(screen.getByTestId('admin-password-input'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByTestId('admin-login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('legacy-admin-landing')).toBeInTheDocument();
    });
  });

  it('displays error banner when authentication fails', async () => {
    authApi.login.mockRejectedValueOnce(new Error('Invalid username or password'));

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<UnifiedLoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByTestId('admin-username-input'), { target: { value: 'baduser' } });
    fireEvent.change(screen.getByTestId('admin-password-input'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByTestId('admin-login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-login-error')).toBeInTheDocument();
      expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
    });
  });
});
