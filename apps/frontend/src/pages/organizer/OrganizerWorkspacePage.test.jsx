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
    getTournamentMatches: vi.fn(),
    updateTournament: vi.fn(),
    updateConfig: vi.fn(),
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
    organizerApi.getTournamentMatches.mockResolvedValueOnce(mockMatches);
    organizerApi.getScorers.mockResolvedValueOnce(mockScorers);
    playersApi.getPlayers.mockResolvedValueOnce(mockPlayers);

    render(
      <MemoryRouter initialEntries={['/organizer']}>
        <Routes>
          <Route path="/organizer" element={<OrganizerWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    );

    // the workspace lands on the Overview tab; the roster is one tab away
    await waitFor(() => expect(screen.getByTestId('organizer-overview-panel')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('tab-teams'));
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
    organizerApi.getTournamentMatches.mockResolvedValue(mockMatches);
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
    organizerApi.getTournamentMatches.mockResolvedValue(mockMatches);
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
    organizerApi.getTournamentMatches.mockResolvedValue(mockMatches);
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

  const mountLoaded = async () => {
    organizerApi.getMyTournaments.mockResolvedValue(mockTournaments);
    teamsApi.getTeams.mockResolvedValue(mockTeams);
    matchesApi.getGroups.mockResolvedValue(mockGroups);
    organizerApi.getTournamentMatches.mockResolvedValue(mockMatches);
    organizerApi.getScorers.mockResolvedValue(mockScorers);
    playersApi.getPlayers.mockResolvedValue(mockPlayers);
    render(
      <MemoryRouter initialEntries={['/organizer']}>
        <Routes><Route path="/organizer" element={<OrganizerWorkspacePage />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByTestId('organizer-overview-panel');
  };

  it('opens on an Overview with live counts, and points to the next setup step', async () => {
    await mountLoaded();
    const panel = screen.getByTestId('organizer-overview-panel');
    expect(panel).toHaveTextContent('Autumn Cup 2026');
    // groups are drawn and fixtures exist, but the one match has no scorer: that is the next step
    const next = panel.querySelector('.ow-step.is-next');
    expect(next).toHaveTextContent('Assign a scorer to every match');
    expect(next).toHaveTextContent('1 without a scorer');
    fireEvent.click(next.querySelector('button'));
    expect(screen.getByTestId('organizer-scorers-panel')).toBeInTheDocument();
  });

  it('keeps all five sections reachable from one tab strip', async () => {
    await mountLoaded();
    for (const [tab, panel] of [
      ['tab-teams', 'organizer-teams-panel'],
      ['tab-fixtures', 'organizer-fixtures-panel'],
      ['tab-scorers', 'organizer-scorers-panel'],
      ['tab-settings', 'organizer-settings-panel'],
      ['tab-overview', 'organizer-overview-panel'],
    ]) {
      fireEvent.click(screen.getByTestId(tab));
      expect(screen.getByTestId(panel)).toBeInTheDocument();
    }
  });

  it('keeps the Danger Zone out of every tab except Settings, and needs the exact name to delete', async () => {
    await mountLoaded();
    expect(screen.queryByTestId('delete-tournament-btn')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-settings'));
    fireEvent.click(screen.getByTestId('delete-tournament-btn'));

    const confirm = screen.getByTestId('confirm-delete-tournament-btn');
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId('delete-confirm-input'), { target: { value: 'autumn cup 2026' } });
    expect(confirm).toBeDisabled(); // case matters
    fireEvent.change(screen.getByTestId('delete-confirm-input'), { target: { value: 'Autumn Cup 2026' } });
    expect(confirm).not.toBeDisabled();

    organizerApi.deleteTournament.mockResolvedValue({});
    organizerApi.getMyTournaments.mockResolvedValue([]);
    fireEvent.click(confirm);
    await waitFor(() => expect(organizerApi.deleteTournament).toHaveBeenCalledWith('tourn-1'));
    await screen.findByTestId('organizer-empty-state');
  });

  it('closes a dialog with Escape and labels it for assistive tech', async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId('tab-teams'));
    fireEvent.click(screen.getByTestId('add-club-btn'));
    expect(screen.getByRole('dialog', { name: 'Register Participating Club' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('add-club-modal')).not.toBeInTheDocument();
  });
});
