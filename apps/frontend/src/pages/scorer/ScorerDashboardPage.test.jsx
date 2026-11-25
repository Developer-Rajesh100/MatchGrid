import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ScorerDashboardPage } from './ScorerDashboardPage';
import { matchesApi } from '../../api/matches';
import { authApi } from '../../api/auth';

vi.mock('../../api/matches');
vi.mock('../../hooks/useLiveSocket', () => ({
  useLiveSocket: () => ({ connected: true }),
}));

describe('ScorerDashboardPage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem('matchgrid_admin_token', 'test-token');
    localStorage.setItem('matchgrid_admin_username', 'scorer_mike');
    localStorage.setItem('matchgrid_role', 'SCORER');
  });

  it('renders assigned matches with enriched details and navigation button', async () => {
    matchesApi.getAssignedMatches.mockResolvedValueOnce([
      {
        id: 'match-101',
        match_number: 1,
        tournament_id: 't-1',
        tournament_name: 'Summer Champions Cup',
        tournament_slug: 'summer-cup',
        stage: 'group',
        label: 'Group A - Match 1',
        status: 'live',
        team1_name: 'Arsenal FC',
        team1_color: '#EF4444',
        team1_crest_url: 'https://r2.cdn/crests/arsenal.png',
        team2_name: 'Chelsea FC',
        team2_color: '#3B82F6',
        team2_crest_url: 'https://r2.cdn/crests/chelsea.png',
        score1: 2,
        score2: 1,
        started_at: new Date().toISOString(),
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/scorer']}>
        <Routes>
          <Route path="/scorer" element={<ScorerDashboardPage />} />
          <Route path="/scorer/matches/:matchId/live" element={<div>Live Console View</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Initial loading indicator
    expect(screen.getByText(/loading your assigned matches/i)).toBeInTheDocument();

    // Wait for match card to render
    await waitFor(() => {
      expect(screen.getByTestId('scorer-match-card-match-101')).toBeInTheDocument();
    });

    expect(screen.getByText('Scorer Cockpit')).toBeInTheDocument();
    expect(screen.getByText('scorer_mike')).toBeInTheDocument();
    expect(screen.getByText('Summer Champions Cup')).toBeInTheDocument();
    expect(screen.getByText('Arsenal FC')).toBeInTheDocument();
    expect(screen.getByText('Chelsea FC')).toBeInTheDocument();
    // the real API fields are score1/score2 (the old cards read team1_score and showed 0 for everything)
    expect(screen.getByLabelText('2 goals')).toBeInTheDocument();
    expect(screen.getByLabelText('1 goals')).toBeInTheDocument();

    const openConsoleBtn = screen.getByTestId('scorer-open-console-match-101');
    expect(openConsoleBtn).toBeInTheDocument();

    // Click button to navigate
    fireEvent.click(openConsoleBtn);
    expect(screen.getByText('Live Console View')).toBeInTheDocument();
  });

  it('renders clean empty state when no matches are assigned to the scorer', async () => {
    matchesApi.getAssignedMatches.mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={['/scorer']}>
        <Routes>
          <Route path="/scorer" element={<ScorerDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('scorer-empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText('No Matches Assigned')).toBeInTheDocument();
    expect(screen.getByText(/when an organizer assigns you to a fixture/i)).toBeInTheDocument();
  });

  it('renders error state when API fails and supports retry', async () => {
    matchesApi.getAssignedMatches
      .mockRejectedValueOnce(new Error('Network error loading matches'))
      .mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={['/scorer']}>
        <Routes>
          <Route path="/scorer" element={<ScorerDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Network error loading matches')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('scorer-empty-state')).toBeInTheDocument();
    });
  });

  const game = (id, status, over = {}) => ({
    id, match_number: Number(id.replace(/\D/g, '')) || 1, tournament_name: 'Cup', stage: 'group', status,
    team1_name: `${id} Home`, team2_name: `${id} Away`, score1: 0, score2: 0, date: '2026-11-25', time: '10:00', ...over,
  });

  it('puts what is live first, then upcoming by kick-off, with finished matches tucked away', async () => {
    matchesApi.getAssignedMatches.mockResolvedValueOnce([
      game('done1', 'full_time', { date: '2026-11-20' }),
      game('later', 'upcoming', { date: '2026-11-30', time: '15:00' }),
      game('sooner', 'upcoming', { date: '2026-11-26', time: '09:00' }),
      game('inplay', 'live', { started_at: new Date().toISOString() }),
      game('done2', 'cancelled', { date: '2026-11-22' }),
    ]);
    const { container } = render(
      <MemoryRouter initialEntries={['/scorer']}>
        <Routes><Route path="/scorer" element={<ScorerDashboardPage />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByTestId('scorer-match-card-inplay');

    const order = [...container.querySelectorAll('[data-testid^="scorer-match-card-"]')].map((c) => c.dataset.testid.replace('scorer-match-card-', ''));
    expect(order).toEqual(['inplay', 'sooner', 'later', 'done2', 'done1']); // live, upcoming by time, finished newest first

    expect(screen.getByRole('heading', { name: 'Live now' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument();
    const finished = container.querySelector('details.scorer-finished');
    expect(finished).not.toHaveAttribute('open'); // secondary: collapsed while there is active work
    expect(finished).toHaveTextContent('Finished (2)');
    expect(container.querySelector('.scorer-summary')).toHaveTextContent('1 live');
  });

  it('opens the finished list by itself when nothing is live or upcoming', async () => {
    matchesApi.getAssignedMatches.mockResolvedValueOnce([game('done1', 'full_time')]);
    const { container } = render(
      <MemoryRouter initialEntries={['/scorer']}>
        <Routes><Route path="/scorer" element={<ScorerDashboardPage />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByTestId('scorer-match-card-done1');
    expect(container.querySelector('details.scorer-finished')).toHaveAttribute('open');
    expect(screen.queryByRole('heading', { name: 'Live now' })).not.toBeInTheDocument();
  });
});
