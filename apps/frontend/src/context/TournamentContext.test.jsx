import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TournamentProvider, useTournament } from './TournamentContext';
import { tournamentApi } from '../api/tournament';

vi.mock('../api/tournament', () => ({
  tournamentApi: {
    getTournamentBySlug: vi.fn(),
  },
}));

vi.mock('../hooks/useLiveSocket', () => ({
  useLiveSocket: vi.fn(),
}));

function Consumer() {
  const { tournament, tournamentId, slug, loading, error } = useTournament();
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!tournament) return <div>No Tournament</div>;
  return (
    <div>
      <span data-testid="t-name">{tournament.name}</span>
      <span data-testid="t-id">{tournamentId}</span>
      <span data-testid="t-slug">{slug}</span>
    </div>
  );
}

describe('TournamentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and provides tournament data for matching slug', async () => {
    tournamentApi.getTournamentBySlug.mockResolvedValueOnce({
      id: 'tourney-123',
      name: 'Champions League 2026',
      slug: 'champions-league-2026',
      season: 'Season 2026',
      status: 'LIVE',
    });

    render(
      <MemoryRouter initialEntries={['/t/champions-league-2026']}>
        <Routes>
          <Route
            path="/t/:slug"
            element={
              <TournamentProvider>
                <Consumer />
              </TournamentProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('t-name')).toHaveTextContent('Champions League 2026');
      expect(screen.getByTestId('t-id')).toHaveTextContent('tourney-123');
      expect(screen.getByTestId('t-slug')).toHaveTextContent('champions-league-2026');
    });
  });

  it('handles error when tournament is not found', async () => {
    tournamentApi.getTournamentBySlug.mockRejectedValueOnce(new Error('Tournament not found'));

    render(
      <MemoryRouter initialEntries={['/t/unknown-tourney']}>
        <Routes>
          <Route
            path="/t/:slug"
            element={
              <TournamentProvider>
                <Consumer />
              </TournamentProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Error: Tournament not found/)).toBeInTheDocument();
    });
  });
});
