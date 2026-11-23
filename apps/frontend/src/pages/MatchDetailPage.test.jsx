import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { MatchDetailPage } from './MatchDetailPage';
import { matchesApi } from '../api/matches';
import { playersApi } from '../api/players';
import { authApi } from '../api/auth';

vi.mock('../hooks/useLiveSocket', () => ({ useLiveSocket: () => ({ connected: false }) }));
vi.mock('../api/matches');
vi.mock('../api/players');
vi.mock('../api/auth');

function baseMatch(overrides = {}) {
  return {
    id: 'm1',
    match_number: 1,
    stage: 'group',
    label: null,
    team1_id: 't1',
    team1_name: 'Red Dragons',
    team2_id: 't2',
    team2_name: 'Golden Hawks',
    status: 'live',
    score1: 1,
    score2: 0,
    is_half_time: false,
    elapsed_seconds: 0,
    winner_id: null,
    events: [],
    lineup: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/matches/m1']}>
      <Routes>
        <Route path="/matches/:matchId" element={<MatchDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  authApi.isAuthenticated.mockReturnValue(false); // Public Audience
  playersApi.getPlayers.mockResolvedValue([]);
});

describe('MatchDetailPage public audience timer & half time visibility', () => {
  it('displays the live timer and live status for audience without controls', async () => {
    matchesApi.getMatch.mockResolvedValue(
      baseMatch({
        status: 'live',
        started_at: new Date(Date.now() - 30000).toISOString(),
        is_half_time: false,
      })
    );

    renderPage();

    // Verify timer display and status are visible
    expect(await screen.findByTestId('public-match-timer')).toBeInTheDocument();
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/live • timer running/i);
    expect(screen.getByTestId('timer-live-dot')).toBeInTheDocument();

    // Verify audience has NO controls
    expect(screen.queryByRole('button', { name: /half time/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start match/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /end match/i })).not.toBeInTheDocument();
  });

  it('displays Half Time status and paused timer for audience', async () => {
    matchesApi.getMatch.mockResolvedValue(
      baseMatch({
        status: 'live',
        started_at: new Date(Date.now() - 1200000).toISOString(),
        is_half_time: true,
        elapsed_seconds: 1200, // 20:00
      })
    );

    renderPage();

    expect(await screen.findByTestId('public-match-timer')).toBeInTheDocument();
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/half time • timer paused/i);
    expect(screen.getByTestId('timer-halftime-dot')).toBeInTheDocument();
    expect(screen.queryByTestId('timer-live-dot')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('timer-display')).toHaveTextContent('20:00'));

    // Status pill shows Half Time
    expect(screen.getByTestId('status-pill-halftime')).toHaveTextContent(/half time/i);

    // Audience cannot modify or control timer
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /half time/i })).not.toBeInTheDocument();
  });

  it('displays Full Time stopped timer for audience when match ends', async () => {
    matchesApi.getMatch.mockResolvedValue(
      baseMatch({
        status: 'full_time',
        started_at: '2026-09-29T10:00:00Z',
        ended_at: '2026-09-29T10:40:00Z',
      })
    );

    renderPage();

    expect(await screen.findByTestId('public-match-timer')).toBeInTheDocument();
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/full time • timer stopped/i);
    // The timer-sync effect that computes this from started_at/ended_at runs
    // as a passive effect after the container itself first renders, so this
    // must be awaited rather than asserted synchronously right after the
    // container appears (a real, if intermittent, race under test-suite load).
    await waitFor(() => expect(screen.getByTestId('timer-display')).toHaveTextContent('40:00'));
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
  });

  // Audit finding L-4: a completed match with no recorded duration anywhere
  // (predates the Timer feature, or was ended without ever being started)
  // must show "no data", not "00:00" (which would misleadingly read as "the
  // match lasted zero seconds").
  it('shows an unknown-duration dash instead of 00:00 for a full-time match with no recorded timer data', async () => {
    matchesApi.getMatch.mockResolvedValue(
      baseMatch({
        status: 'full_time',
        started_at: null,
        ended_at: null,
        elapsed_seconds: null,
      })
    );

    renderPage();

    expect(await screen.findByTestId('public-match-timer')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('timer-display')).toHaveTextContent('—'));
    expect(screen.getByTestId('timer-display')).not.toHaveTextContent('00:00');
  });
});

// Audit finding L-5: the page used to fetch every player in the tournament
// on every view just to label the current match's lineup. It should only
// fetch the two teams actually involved in this match.
describe('MatchDetailPage player-roster fetch scope', () => {
  it('fetches players scoped to only this match\'s two teams, not the whole tournament', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ team1_id: 't1', team2_id: 't2' }));

    renderPage();

    await screen.findByTestId('public-match-timer');

    expect(playersApi.getPlayers).not.toHaveBeenCalledWith();
    expect(playersApi.getPlayers).not.toHaveBeenCalledWith({});
    expect(playersApi.getPlayers).toHaveBeenCalledWith({ team_id: 't1' });
    expect(playersApi.getPlayers).toHaveBeenCalledWith({ team_id: 't2' });
    expect(playersApi.getPlayers).toHaveBeenCalledTimes(2);
  });
});
