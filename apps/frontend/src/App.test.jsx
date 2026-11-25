import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

vi.mock('./routes/AppRouter', () => ({ AppRouter: () => <div data-testid="routed-page">page</div> }));
vi.mock('./api/tournament', () => ({ tournamentApi: { getPublicTournaments: vi.fn().mockResolvedValue([]) } }));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('application shell', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchgrid_admin_token', 't');
    localStorage.setItem('matchgrid_role', 'SCORER');
    localStorage.setItem('matchgrid_admin_username', 'demo_scorer_01');
  });

  it('public pages: header, footer, a single Tournaments entry, no marketing strip or copy', () => {
    renderAt('/');
    const header = screen.getByRole('banner');
    expect(within(header).getAllByText('Tournaments')).toHaveLength(1);
    expect(within(header).queryByRole('button', { name: /select tournament/i })).not.toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('MatchGrid');
    expect(document.querySelector('.brand-banner')).toBeNull();
    expect(screen.queryByText(/MATCHGRID LIVE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sub-millisecond/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Engine:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Flagship/i)).not.toBeInTheDocument();
  });

  it('inside a tournament the switcher appears next to the Tournaments link', () => {
    renderAt('/t/some-cup/matches');
    expect(within(screen.getByRole('banner')).getByRole('button', { name: /select tournament/i })).toBeInTheDocument();
  });

  it('the scorer cockpit and console get the focused operations shell', () => {
    for (const path of ['/scorer', '/scorer/matches/abc/live']) {
      const { unmount } = renderAt(path);
      const header = screen.getByRole('banner');
      expect(header).toHaveClass('ops-bar');
      expect(within(header).getByLabelText(/signed in as demo_scorer_01, scorer/i)).toBeInTheDocument();
      expect(within(header).queryByText('demo_scorer_01')).not.toBeInTheDocument();
      expect(within(header).getByRole('button', { name: /logout/i })).toBeInTheDocument();
      expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: /main navigation/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('routed-page')).toBeInTheDocument();
      unmount();
    }
  });

  it('other portals keep the full shell', () => {
    renderAt('/organizer');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  });

  it('the connection indicator is a labelled dot, not a LIVE word that looks like a live match', () => {
    renderAt('/');
    const indicator = screen.getAllByRole('status').find((el) => el.classList.contains('connection-indicator'));
    expect(indicator).toHaveAttribute('aria-label', expect.stringMatching(/live updates|reconnecting/i));
    expect(indicator.textContent).toBe('');
  });
});
