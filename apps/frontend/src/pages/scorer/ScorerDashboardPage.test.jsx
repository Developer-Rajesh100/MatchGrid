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
        team1_score: 2,
        team2_score: 1,
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/scorer']}>
        <Routes>
          <Route path="/scorer" element={<ScorerDashboardPage />} />
          <Route path="/admin/matches/:matchId/live" element={<div>Live Console View</div>} />
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
    expect(screen.getByText('2 : 1')).toBeInTheDocument();

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
});
