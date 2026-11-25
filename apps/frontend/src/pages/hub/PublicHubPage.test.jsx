import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicHubPage } from './PublicHubPage';
import { tournamentApi } from '../../api/tournament';

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
    status: 'draft',
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

    render(
      <MemoryRouter>
        <PublicHubPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading Tournament Hub...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('MatchGrid Tournament Hub')).toBeInTheDocument();
      expect(screen.getByText('Premier Cup')).toBeInTheDocument();
      expect(screen.getByText('Summer Invitational')).toBeInTheDocument();
      expect(screen.getByText('Winter Classic')).toBeInTheDocument();
    });

    // Spotlight banner for live matches
    expect(screen.getByText(/2 MATCHES LIVE/)).toBeInTheDocument();

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

    // Click 'Upcoming' tab
    const upcomingTab = screen.getByRole('tab', { name: /Upcoming/i });
    fireEvent.click(upcomingTab);

    expect(screen.queryByText('Premier Cup')).not.toBeInTheDocument();
    expect(screen.getByText('Summer Invitational')).toBeInTheDocument();
    expect(screen.queryByText('Winter Classic')).not.toBeInTheDocument();
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
});
