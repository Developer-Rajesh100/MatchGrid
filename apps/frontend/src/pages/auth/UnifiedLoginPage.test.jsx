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

  it('returns to the page that required sign-in, and says when the session expired', async () => {
    authApi.login.mockResolvedValueOnce({ access_token: 't', role: 'ORGANIZER', username: 'org' });

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/login', state: { from: { pathname: '/organizer' }, expired: true } }]}
      >
        <Routes>
          <Route path="/login" element={<UnifiedLoginPage />} />
          <Route path="/organizer" element={<div data-testid="back-where-i-was">Organizer</div>} />
          <Route path="/superadmin" element={<div>wrong landing</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('session-expired')).toHaveTextContent(/session expired/i);
    fireEvent.change(screen.getByTestId('admin-username-input'), { target: { value: 'org' } });
    fireEvent.change(screen.getByTestId('admin-password-input'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByTestId('admin-login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('back-where-i-was')).toBeInTheDocument();
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
