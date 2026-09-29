import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { RequireAdmin } from './RequireAdmin';

// RequireAdmin is the guard every /admin/* route depends on — it had zero
// automated test coverage before this (confirmed via manual inspection
// during the Timer/Half-Time audit's Test Coverage follow-up), despite
// being the one component standing between an unauthenticated visitor and
// the entire admin panel.

function renderGuarded(initialPath = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/login" element={<div>Login Page</div>} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <div>Protected Admin Content</div>
            </RequireAdmin>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('RequireAdmin', () => {
  it('renders the protected content when a token is present', () => {
    localStorage.setItem('dcl_admin_token', 'a-real-looking-token');
    renderGuarded();
    expect(screen.getByText('Protected Admin Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('redirects to /admin/login when there is no token', () => {
    renderGuarded();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Admin Content')).not.toBeInTheDocument();
  });

  it('redirects to /admin/login when the token was cleared (e.g. after logout)', () => {
    localStorage.setItem('dcl_admin_token', 'a-real-looking-token');
    localStorage.removeItem('dcl_admin_token');
    renderGuarded();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});
