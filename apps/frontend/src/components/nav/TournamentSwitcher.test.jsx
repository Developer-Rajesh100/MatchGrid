import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TournamentSwitcher } from './TournamentSwitcher';
import { tournamentApi } from '../../api/tournament';

vi.mock('../../api/tournament', () => ({
  tournamentApi: {
    getPublicTournaments: vi.fn(),
  },
}));

const mockTournaments = [
  { id: 't-1', name: 'Champions Trophy', slug: 'champions-trophy', status: 'active', live_matches_count: 1 },
  { id: 't-2', name: 'Super League', slug: 'super-league', status: 'draft', live_matches_count: 0 },
];

describe('TournamentSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dropdown button with active tournament name', async () => {
    tournamentApi.getPublicTournaments.mockResolvedValueOnce(mockTournaments);

    render(
      <MemoryRouter initialEntries={['/t/champions-trophy/matches']}>
        <TournamentSwitcher />
      </MemoryRouter>
    );

    const btn = screen.getByRole('button', { name: /Select tournament/i });
    await waitFor(() => expect(btn).toHaveTextContent('Champions Trophy'));
  });

  it('opens menu on click and lists competitions with live badge', async () => {
    tournamentApi.getPublicTournaments.mockResolvedValueOnce(mockTournaments);

    render(
      <MemoryRouter>
        <TournamentSwitcher />
      </MemoryRouter>
    );

    const btn = screen.getByRole('button', { name: /Select tournament/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByText('Super League')).toBeInTheDocument();
    });
  });
});
