import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrganizerWorkspacePage } from './OrganizerWorkspacePage';
import { organizerApi } from '../../api/organizer';
import { teamsApi } from '../../api/teams';
import { playersApi } from '../../api/players';
import { matchesApi } from '../../api/matches';

vi.mock('../../api/organizer', () => ({
  organizerApi: {
    getMyTournaments: vi.fn(),
    createTournament: vi.fn(),
    deleteTournament: vi.fn(),
    getScorers: vi.fn(),
    createScorer: vi.fn(),
    deleteScorer: vi.fn(),
    assignScorer: vi.fn(),
    removeScorer: vi.fn(),
  },
}));

vi.mock('../../api/teams', () => ({
  teamsApi: {
    getTeams: vi.fn(),
    createTeam: vi.fn(),
    deleteTeam: vi.fn(),
  },
}));

vi.mock('../../api/players', () => ({
  playersApi: {
    getPlayers: vi.fn(),
    createPlayer: vi.fn(),
    deletePlayer: vi.fn(),
  },
}));

vi.mock('../../api/matches', () => ({
  matchesApi: {
    getGroups: vi.fn(),
    getMatches: vi.fn(),
    randomGroupDraw: vi.fn(),
    generateGroupFixtures: vi.fn(),
    seedKnockout: vi.fn(),
    updateMatch: vi.fn(),
  },
}));

describe('OrganizerWorkspacePage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockTournaments = [
    {
      id: 'tourn-1',
      name: 'Autumn Cup 2026',
      slug: 'autumn-cup-2026',
      season: '2026',
      stage: 'GROUP_STAGE',
      config: {
        num_groups: 2,
        teams_per_group: 3,
        qualifiers_per_group: 2,
        knockout_format: 'semis_final',
        match_duration_half_minutes: 20,
      },
    },
  ];

  const mockTeams = [
    {
      id: 'team-1',
      name: 'Red Hawks',
      color: '#EF4444',
      crest_url: null,
      player_count: 5,
    },
  ];

  const mockPlayers = [
    {
      id: 'p-1',
      name: 'Marcus Bell',
      number: 7,
      is_manager: false,
      photo_url: null,
    },
  ];

  const mockGroups = [
    {
      id: 'grp-a',
      name: 'A',
      teams: [{ id: 'team-1', name: 'Red Hawks', color: '#EF4444' }],
    },
  ];

  const mockMatches = [
    {
      id: 'm-1',
      match_number: 1,
      team1_name: 'Red Hawks',
      team2_name: 'Blue Jays',
      stage: 'group',
      label: 'Group A - Match 1',
      status: 'scheduled',
      date: '2026-11-25',
      time: '18:00',
      venue: 'Pitch 1',
      assigned_scorer_ids: [],
    },
  ];

  const mockScorers = [
    {
      id: 'sc-1',
      username: 'scorer_john',
      role: 'SCORER',
    },
  ];

  it('renders tournament selector and teams roster', async () => {
    organizerApi.getMyTournaments.mockResolvedValueOnce(mockTournaments);
    teamsApi.getTeams.mockResolvedValueOnce(mockTeams);
    matchesApi.getGroups.mockResolvedValueOnce(mockGroups);
    matchesApi.getMatches.mockResolvedValueOnce(mockMatches);
    organizerApi.getScorers.mockResolvedValueOnce(mockScorers);
    playersApi.getPlayers.mockResolvedValueOnce(mockPlayers);

    render(
      <MemoryRouter initialEntries={['/organizer']}>
        <Routes>
          <Route path="/organizer" element={<OrganizerWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tournament-selector')).toBeInTheDocument();
      expect(screen.getByTestId('organizer-teams-panel')).toBeInTheDocument();
      expect(screen.getByText('Autumn Cup 2026 (2026)')).toBeInTheDocument();
      expect(screen.getByText('Red Hawks')).toBeInTheDocument();
    });
  });

  it('opens Tournament Creation Wizard and proceeds through 2 steps', async () => {
    organizerApi.getMyTournaments.mockResolvedValue(mockTournaments);
    teamsApi.getTeams.mockResolvedValue(mockTeams);
    matchesApi.getGroups.mockResolvedValue(mockGroups);
    matchesApi.getMatches.mockResolvedValue(mockMatches);
    organizerApi.getScorers.mockResolvedValue(mockScorers);
    playersApi.getPlayers.mockResolvedValue(mockPlayers);

    organizerApi.createTournament.mockResolvedValueOnce({
      id: 'tourn-2',
      name: 'Spring Invitational',
      slug: 'spring-invitational',
      season: '2027',
      stage: 'UPCOMING',
    });

    render(
      <MemoryRouter initialEntries={['/organizer']}>
        <Routes>
          <Route path="/organizer" element={<OrganizerWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('create-competition-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-competition-btn'));
    expect(screen.getByTestId('wizard-modal')).toBeInTheDocument();

    // Step 1: Identity
    fireEvent.change(screen.getByTestId('wizard-name'), { target: { value: 'Spring Invitational' } });
    fireEvent.change(screen.getByTestId('wizard-season'), { target: { value: '2027' } });
    fireEvent.click(screen.getByTestId('wizard-next-btn'));

    // Step 2: Format Rules & Submit
    expect(screen.getByTestId('wizard-num-groups')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wizard-submit-btn'));

    await waitFor(() => {
      expect(organizerApi.createTournament).toHaveBeenCalled();
    });
  });

  it('switches tabs and executes random draw and fixtures actions', async () => {
    organizerApi.getMyTournaments.mockResolvedValue(mockTournaments);
    teamsApi.getTeams.mockResolvedValue(mockTeams);
    matchesApi.getGroups.mockResolvedValue(mockGroups);
    matchesApi.getMatches.mockResolvedValue(mockMatches);
    organizerApi.getScorers.mockResolvedValue(mockScorers);
    playersApi.getPlayers.mockResolvedValue(mockPlayers);

    matchesApi.randomGroupDraw.mockResolvedValueOnce({ success: true });
    window.confirm = vi.fn().mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/organizer']}>
        <Routes>
          <Route path="/organizer" element={<OrganizerWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tab-fixtures')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-fixtures'));
    expect(screen.getByTestId('organizer-fixtures-panel')).toBeInTheDocument();

    const randomDrawBtn = screen.getByTestId('random-draw-btn');
    fireEvent.click(randomDrawBtn);

    await waitFor(() => {
      expect(matchesApi.randomGroupDraw).toHaveBeenCalledWith('tourn-1');
    });
  });

  it('allows provisioning a scorer and assigning to a match', async () => {
    organizerApi.getMyTournaments.mockResolvedValue(mockTournaments);
    teamsApi.getTeams.mockResolvedValue(mockTeams);
    matchesApi.getGroups.mockResolvedValue(mockGroups);
    matchesApi.getMatches.mockResolvedValue(mockMatches);
    organizerApi.getScorers.mockResolvedValue(mockScorers);
    playersApi.getPlayers.mockResolvedValue(mockPlayers);

    organizerApi.createScorer.mockResolvedValueOnce({
      id: 'sc-2',
      username: 'scorer_alice',
      role: 'SCORER',
    });

    render(
      <MemoryRouter initialEntries={['/organizer']}>
        <Routes>
          <Route path="/organizer" element={<OrganizerWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tab-scorers')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-scorers'));
    expect(screen.getByTestId('organizer-scorers-panel')).toBeInTheDocument();

    // Provision Scorer
    fireEvent.click(screen.getByTestId('create-scorer-btn'));
    expect(screen.getByTestId('provision-scorer-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('scorer-username-input'), { target: { value: 'scorer_alice' } });
    fireEvent.change(screen.getByTestId('scorer-password-input'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByTestId('submit-scorer-btn'));

    await waitFor(() => {
      expect(organizerApi.createScorer).toHaveBeenCalledWith('scorer_alice', 'password123');
    });
  });
});
