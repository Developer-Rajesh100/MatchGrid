import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TournamentBracket from './TournamentBracket';
import { matchesApi } from '../../api/matches';

vi.mock('../../api/matches', () => ({
  matchesApi: {
    getBracket: vi.fn(),
  },
}));

describe('TournamentBracket Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    matchesApi.getBracket.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <TournamentBracket tournamentId="t1" />
      </MemoryRouter>
    );
    expect(screen.getByTestId('bracket-loading')).toBeInTheDocument();
    expect(screen.getByText(/Loading knockout bracket.../i)).toBeInTheDocument();
  });

  it('renders error state on API failure', async () => {
    matchesApi.getBracket.mockRejectedValue(new Error('Network error'));
    render(
      <MemoryRouter>
        <TournamentBracket tournamentId="t1" />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('bracket-error')).toBeInTheDocument();
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('renders empty pending state when no rounds or matches exist', async () => {
    matchesApi.getBracket.mockResolvedValue({
      tournament_id: 't1',
      knockout_format: 'semis_final',
      rounds: [],
      champion: null,
    });
    render(
      <MemoryRouter>
        <TournamentBracket tournamentId="t1" />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('bracket-empty')).toBeInTheDocument();
      expect(screen.getByText(/Knockout Stage Pending/i)).toBeInTheDocument();
    });
  });

  it('renders populated bracket tree with rounds and match cards', async () => {
    const mockBracket = {
      tournament_id: 't1',
      knockout_format: 'semis_final',
      rounds: [
        {
          round_order: 1,
          round_name: 'Semi-finals',
          matches: [
            {
              bracket_slot: 'SF1',
              match_id: 'm1',
              match_number: 7,
              stage: 'semi',
              label: 'Semi-final 1',
              team1: { id: 'team-a', name: 'Red Dragons', crest_url: null },
              team2: { id: 'team-b', name: 'Golden Hawks', crest_url: null },
              score1: 2,
              score2: 1,
              winner_id: 'team-a',
              status: 'full_time',
            },
            {
              bracket_slot: 'SF2',
              match_id: 'm2',
              match_number: 8,
              stage: 'semi',
              label: 'Semi-final 2',
              team1: { id: 'team-c', name: 'Blue Whales', crest_url: null },
              team2: { id: 'team-d', name: 'Black Panthers', crest_url: null },
              score1: 0,
              score2: 0,
              winner_id: null,
              status: 'live',
            },
          ],
        },
        {
          round_order: 2,
          round_name: 'Final',
          matches: [
            {
              bracket_slot: 'FINAL',
              match_id: 'm3',
              match_number: 9,
              stage: 'final',
              label: 'Final',
              team1: { id: 'team-a', name: 'Red Dragons', crest_url: null },
              team2: null,
              score1: 0,
              score2: 0,
              winner_id: null,
              status: 'upcoming',
            },
          ],
        },
      ],
      champion: null,
    };

    matchesApi.getBracket.mockResolvedValue(mockBracket);

    render(
      <MemoryRouter>
        <TournamentBracket tournamentId="t1" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tournament-bracket')).toBeInTheDocument();
    });

    expect(screen.getByTestId('bracket-round-1')).toBeInTheDocument();
    expect(screen.getByTestId('bracket-round-2')).toBeInTheDocument();
    expect(screen.getByText('Semi-finals')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();

    expect(screen.getByTestId('match-card-SF1')).toBeInTheDocument();
    expect(screen.getByTestId('match-card-SF2')).toBeInTheDocument();
    expect(screen.getByTestId('match-card-FINAL')).toBeInTheDocument();

    expect(screen.getAllByText('Red Dragons')).toHaveLength(2);
    expect(screen.getByText('Golden Hawks')).toBeInTheDocument();
    expect(screen.getByText('● LIVE')).toBeInTheDocument();
    expect(screen.getByText('FT')).toBeInTheDocument();
  });

  it('renders champion banner when champion is crowned', async () => {
    const mockBracket = {
      tournament_id: 't1',
      knockout_format: 'semis_final',
      rounds: [
        {
          round_order: 1,
          round_name: 'Final',
          matches: [
            {
              bracket_slot: 'FINAL',
              match_id: 'm3',
              match_number: 9,
              stage: 'final',
              label: 'Final',
              team1: { id: 'team-a', name: 'Red Dragons' },
              team2: { id: 'team-c', name: 'Blue Whales' },
              score1: 3,
              score2: 1,
              winner_id: 'team-a',
              status: 'full_time',
            },
          ],
        },
      ],
      champion: {
        team_id: 'team-a',
        name: 'Red Dragons',
        crest_url: 'https://cdn.matchgrid.app/crest.png',
      },
    };

    matchesApi.getBracket.mockResolvedValue(mockBracket);

    render(
      <MemoryRouter>
        <TournamentBracket tournamentId="t1" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('champion-banner')).toBeInTheDocument();
      expect(screen.getByText(/TOURNAMENT CHAMPION/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Red Dragons' })).toBeInTheDocument();
    });
  });
});
