import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicHubPage } from './PublicHubPage';
import { tournamentApi } from '../../api/tournament';
import { matchesApi } from '../../api/matches';

vi.mock('../../api/matches', () => ({ matchesApi: { getFeaturedLive: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/tournament', () => ({
  tournamentApi: {
    getPublicTournaments: vi.fn(),
  },
}));

vi.mock('../../hooks/useLiveSocket', () => ({
  useLiveSocket: vi.fn(),
}));

const mockTournaments = [
  {
    id: 't-1',
    name: 'Premier Cup',
    slug: 'premier-cup',
    season: '2026',
    status: 'active',
    live_matches_count: 2,
    teams_count: 8,
    matches_count: 12,
  },
  {
    id: 't-2',
    name: 'Summer Invitational',
    slug: 'summer-invitational',
    season: '2026',
    status: 'active',
    live_matches_count: 0,
    teams_count: 6,
    matches_count: 10,
  },
  {
    id: 't-3',
    name: 'Winter Classic',
    slug: 'winter-classic',
    season: '2025',
    status: 'completed',
    live_matches_count: 0,
    teams_count: 4,
    matches_count: 6,
    champion_team_name: 'Red Dragons',
  },
];

describe('PublicHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tournament hub with spotlight banner and tournament cards', async () => {
    tournamentApi.getPublicTournaments.mockResolvedValueOnce(mockTournaments);
    matchesApi.getFeaturedLive.mockResolvedValueOnce([
      {
        id: 'm-1', tournament_id: 't-1', tournament_slug: 'premier-cup', tournament_name: 'Premier Cup',
        status: 'live', is_half_time: true, score1: 2, score2: 1, team1_name: 'Red Dragons', team2_name: 'Blue Whales',
        team1_color: '#EF4444', team2_color: '#3B82F6',
      },
    ]);

    render(
      <MemoryRouter>
        <PublicHubPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading Tournament Hub...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('MatchGrid Tournament Hub')).toBeInTheDocument();
      expect(screen.getAllByText('Premier Cup').length).toBeGreaterThan(0); // in the strip and the directory
      expect(screen.getByText('Summer Invitational')).toBeInTheDocument();
      expect(screen.getByText('Winter Classic')).toBeInTheDocument();
    });

    // Spotlight banner for live matches
    const strip = screen.getByRole('region', { name: /live now/i });
    expect(strip).toHaveTextContent(/2 matches live/i);
    expect(strip).toHaveTextContent('Red Dragons');
    expect(strip).toHaveTextContent('HT'); // half time shows as HT, not a minute
    expect(within(strip).getByRole('link')).toHaveAttribute('href', '/t/premier-cup/matches/m-1');

    // Champion honors for completed tournament
    expect(screen.getByText(/Champion: Red Dragons/)).toBeInTheDocument();
  });

  it('filters tournaments by status tab', async () => {
    tournamentApi.getPublicTournaments.mockResolvedValueOnce(mockTournaments);

    render(
      <MemoryRouter>
        <PublicHubPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Premier Cup')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Active/i }));
    expect(screen.getByText('Premier Cup')).toBeInTheDocument();
    expect(screen.getByText('Summer Invitational')).toBeInTheDocument();
    expect(screen.queryByText('Winter Classic')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Completed/i }));
    expect(screen.queryByText('Premier Cup')).not.toBeInTheDocument();
    expect(screen.queryByText('Summer Invitational')).not.toBeInTheDocument();
    expect(screen.getByText('Winter Classic')).toBeInTheDocument();
  });

  it('filters tournaments by search query', async () => {
    tournamentApi.getPublicTournaments.mockResolvedValueOnce(mockTournaments);

    render(
      <MemoryRouter>
        <PublicHubPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Premier Cup')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search competitions...');
    fireEvent.change(searchInput, { target: { value: 'Winter' } });

    expect(screen.queryByText('Premier Cup')).not.toBeInTheDocument();
    expect(screen.queryByText('Summer Invitational')).not.toBeInTheDocument();
    expect(screen.getByText('Winter Classic')).toBeInTheDocument();
  });

  it('has no live strip when nothing is in play, and the directory still renders if the feed fails', async () => {
    tournamentApi.getPublicTournaments.mockResolvedValueOnce(mockTournaments);
    matchesApi.getFeaturedLive.mockRejectedValueOnce(new Error('feed down'));
    render(
      <MemoryRouter>
        <PublicHubPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Premier Cup')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: /live now/i })).not.toBeInTheDocument();
    // each competition is one link row to its tournament centre
    expect(screen.getByRole('link', { name: /Summer Invitational/ })).toHaveAttribute('href', '/t/summer-invitational');
  });
});
