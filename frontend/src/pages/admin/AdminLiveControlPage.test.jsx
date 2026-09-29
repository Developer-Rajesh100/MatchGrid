import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AdminLiveControlPage } from './AdminLiveControlPage';
import { matchesApi } from '../../api/matches';
import { playersApi } from '../../api/players';

// The WebSocket layer is exercised by manual two-browser-window testing
// (Phase 3) — here it's mocked to a no-op so these tests stay focused on
// the form logic itself, the highest-risk manual-entry surface per
// implementation.txt Phase 8.3.
vi.mock('../../hooks/useLiveSocket', () => ({ useLiveSocket: () => ({ connected: false }) }));
vi.mock('../../api/matches');
vi.mock('../../api/players');

const TEAM1_PLAYERS = [
  { id: 'p1', number: 1, name: 'Keeper One', position: 'GK' },
  { id: 'p2', number: 9, name: 'Striker One', position: 'FWD' },
  { id: 'p3', number: 8, name: 'Mid One', position: 'MID' },
];
const TEAM2_PLAYERS = [
  { id: 'p4', number: 1, name: 'Keeper Two', position: 'GK' },
  { id: 'p5', number: 7, name: 'Striker Two', position: 'FWD' },
];

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
    score1: 0,
    score2: 0,
    winner_id: null,
    events: [],
    lineup: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/matches/m1/live']}>
      <Routes>
        <Route path="/admin/matches/:matchId/live" element={<AdminLiveControlPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  playersApi.getPlayers.mockImplementation(({ team_id }) =>
    Promise.resolve(team_id === 't1' ? TEAM1_PLAYERS : TEAM2_PLAYERS)
  );
});

describe('status-gated lifecycle controls', () => {
  it('shows Start Match for an upcoming match', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ status: 'upcoming' }));
    renderPage();
    expect(await screen.findByRole('button', { name: /start match/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /end match/i })).not.toBeInTheDocument();
  });

  it('shows End Match for a live match', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ status: 'live' }));
    renderPage();
    expect(await screen.findByRole('button', { name: /end match/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start match/i })).not.toBeInTheDocument();
  });

  it('shows Reopen for a completed match', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ status: 'full_time' }));
    renderPage();
    expect(await screen.findByRole('button', { name: /reopen match/i })).toBeInTheDocument();
  });

  it('shows the winner-override control only for a completed knockout match', async () => {
    matchesApi.getMatch.mockResolvedValue(
      baseMatch({ status: 'full_time', stage: 'final', label: 'Final' })
    );
    renderPage();
    expect(await screen.findByText(/winner:/i)).toBeInTheDocument();
  });

  it('does not show the winner-override control for a completed group match', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ status: 'full_time', stage: 'group' }));
    renderPage();
    await screen.findByRole('button', { name: /reopen match/i });
    expect(screen.queryByText(/winner:/i)).not.toBeInTheDocument();
  });
});

describe('event entry form', () => {
  it('hides the minute field for a POTM event but shows it for a goal', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch());
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /submit event/i });

    expect(screen.getByLabelText(/match minute/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /potm/i }));
    expect(screen.queryByLabelText(/match minute/i)).not.toBeInTheDocument();
  });

  it('only shows the assist field for a goal event', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch());
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /submit event/i });

    expect(screen.getByLabelText(/assist/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /yellow/i }));
    expect(screen.queryByLabelText(/assist/i)).not.toBeInTheDocument();
  });

  it('lists the correct squad for whichever team is selected', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch());
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /submit event/i });

    const playerSelect = screen.getByLabelText(/^player$/i);

    // team1 (Red Dragons) is selected by default
    expect(within(playerSelect).getByRole('option', { name: /striker one/i })).toBeInTheDocument();
    expect(within(playerSelect).queryByRole('option', { name: /striker two/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Golden Hawks' }));
    expect(within(playerSelect).getByRole('option', { name: /striker two/i })).toBeInTheDocument();
    expect(within(playerSelect).queryByRole('option', { name: /striker one/i })).not.toBeInTheDocument();
  });

  it('excludes the selected scorer from their own assist options', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch());
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /submit event/i });

    await user.selectOptions(screen.getByLabelText(/^player$/i), 'p2'); // Striker One scores

    const assistSelect = screen.getByLabelText(/assist/i);
    expect(within(assistSelect).queryByRole('option', { name: /striker one/i })).not.toBeInTheDocument();
    expect(within(assistSelect).getByRole('option', { name: /mid one/i })).toBeInTheDocument();
  });

  it('submits a goal with a numeric minute and the chosen assist', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch());
    matchesApi.addEvent.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /submit event/i });

    await user.selectOptions(screen.getByLabelText(/^player$/i), 'p2');
    await user.selectOptions(screen.getByLabelText(/assist/i), 'p3');
    await user.type(screen.getByLabelText(/match minute/i), '34');
    await user.click(screen.getByRole('button', { name: /submit event/i }));

    await waitFor(() => expect(matchesApi.addEvent).toHaveBeenCalledTimes(1));
    const [matchId, payload] = matchesApi.addEvent.mock.calls[0];
    expect(matchId).toBe('m1');
    expect(payload).toMatchObject({
      type: 'goal', team_id: 't1', player_id: 'p2', assist_player_id: 'p3', minute: 34,
    });
  });

  it('submits a POTM event without a minute or assist field at all', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch());
    matchesApi.addEvent.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /submit event/i });

    await user.click(screen.getByRole('button', { name: /potm/i }));
    await user.selectOptions(screen.getByLabelText(/^player$/i), 'p1');
    await user.click(screen.getByRole('button', { name: /submit event/i }));

    await waitFor(() => expect(matchesApi.addEvent).toHaveBeenCalledTimes(1));
    const [, payload] = matchesApi.addEvent.mock.calls[0];
    expect(payload.type).toBe('potm');
    expect(payload.minute).toBeUndefined();
    expect(payload.assist_player_id).toBeUndefined();
  });
});

describe('lineup selection', () => {
  it('toggles a player in and out of the lineup and saves the full list', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch());
    matchesApi.updateLineup.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /submit event/i });

    const checkbox = screen.getByRole('checkbox', { name: /striker one/i });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: /save lineups/i }));
    await waitFor(() => expect(matchesApi.updateLineup).toHaveBeenCalledWith('m1', ['p2']));

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});

describe('winner override', () => {
  it('calls setWinner with the chosen team id', async () => {
    matchesApi.getMatch.mockResolvedValue(
      baseMatch({ status: 'full_time', stage: 'final', label: 'Final' })
    );
    matchesApi.setWinner.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    const winnerLabel = await screen.findByText(/winner:/i);
    const winnerSection = winnerLabel.closest('div');

    await user.click(within(winnerSection).getByRole('button', { name: 'Golden Hawks' }));
    await waitFor(() => expect(matchesApi.setWinner).toHaveBeenCalledWith('m1', 't2'));
  });
});

describe('match live timer', () => {
  it('displays 00:00 and not started state for an upcoming match', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ status: 'upcoming' }));
    renderPage();
    expect(await screen.findByTestId('match-timer')).toBeInTheDocument();
    expect(screen.getByTestId('timer-display')).toHaveTextContent('00:00');
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/not started/i);
  });

  it('displays running state with live indicator for a live match', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ status: 'live' }));
    renderPage();
    expect(await screen.findByTestId('match-timer')).toBeInTheDocument();
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/live • timer running/i);
    expect(screen.getByTestId('timer-live-dot')).toBeInTheDocument();
  });

  it('displays stopped state when match is full_time', async () => {
    matchesApi.getMatch.mockResolvedValue(
      baseMatch({
        status: 'full_time',
        started_at: '2026-09-29T10:00:00Z',
        ended_at: '2026-09-29T10:45:00Z',
      })
    );
    renderPage();
    expect(await screen.findByTestId('match-timer')).toBeInTheDocument();
    // The timer-sync effect that computes this from started_at/ended_at runs
    // as a passive effect after the container itself first renders, so this
    // must be awaited rather than asserted synchronously right after the
    // container appears (a real, if intermittent, race under test-suite load).
    await waitFor(() => expect(screen.getByTestId('timer-display')).toHaveTextContent('45:00'));
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/full time • timer stopped/i);
    expect(screen.queryByTestId('timer-live-dot')).not.toBeInTheDocument();
  });

  // Audit finding L-4: a completed match with no recorded duration anywhere
  // (predates the Timer feature, or was ended without ever being started, and
  // this is a fresh page load with no locally-cached session timer either)
  // must show "no data", not "00:00" (which would misleadingly read as "the
  // match lasted zero seconds").
  it('shows an unknown-duration dash instead of 00:00 for a full-time match with no recorded timer data', async () => {
    matchesApi.getMatch.mockResolvedValue(
      baseMatch({ status: 'full_time', started_at: null, ended_at: null })
    );
    renderPage();
    expect(await screen.findByTestId('match-timer')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('timer-display')).toHaveTextContent('—'));
    expect(screen.getByTestId('timer-display')).not.toHaveTextContent('00:00');
  });

  it('starts the timer automatically when Start Match is clicked', async () => {
    const upcoming = baseMatch({ status: 'upcoming' });
    const live = baseMatch({ status: 'live' });
    matchesApi.getMatch.mockResolvedValueOnce(upcoming).mockResolvedValueOnce(live);
    matchesApi.startMatch.mockResolvedValue(live);

    const user = userEvent.setup();
    renderPage();

    const startBtn = await screen.findByRole('button', { name: /start match/i });
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/not started/i);

    await user.click(startBtn);
    await waitFor(() => expect(matchesApi.startMatch).toHaveBeenCalledWith('m1'));
    await waitFor(() =>
      expect(screen.getByTestId('timer-status')).toHaveTextContent(/live • timer running/i)
    );
  });

  it('stops the timer automatically when End Match is clicked', async () => {
    const live = baseMatch({ status: 'live' });
    const fullTime = baseMatch({
      status: 'full_time',
      started_at: '2026-09-29T10:00:00Z',
      ended_at: '2026-09-29T10:40:00Z',
    });
    matchesApi.getMatch.mockResolvedValueOnce(live).mockResolvedValueOnce(fullTime);
    matchesApi.endMatch.mockResolvedValue(fullTime);

    const user = userEvent.setup();
    renderPage();

    const endBtn = await screen.findByRole('button', { name: /end match/i });
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/live • timer running/i);

    await user.click(endBtn);
    await waitFor(() => expect(matchesApi.endMatch).toHaveBeenCalledWith('m1'));
    await waitFor(() =>
      expect(screen.getByTestId('timer-status')).toHaveTextContent(/full time • timer stopped/i)
    );
  });

  it('starts the timer from 00:00 and counts upward', async () => {
    const upcoming = baseMatch({ status: 'upcoming' });
    const live = baseMatch({ status: 'live' });
    matchesApi.getMatch.mockResolvedValueOnce(upcoming).mockResolvedValueOnce(live);
    matchesApi.startMatch.mockResolvedValue(live);

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /start match/i });
    expect(screen.getByTestId('timer-display')).toHaveTextContent('00:00');

    await user.click(screen.getByRole('button', { name: /start match/i }));
    await waitFor(() => expect(matchesApi.startMatch).toHaveBeenCalledWith('m1'));
    expect(screen.getByTestId('timer-display')).toHaveTextContent('00:00');
  });

  it('stops at the current elapsed time when match ends without jumping to duration_minutes', async () => {
    const live = baseMatch({
      status: 'live',
      started_at: new Date(Date.now() - 15000).toISOString(),
      duration_minutes: 40,
    });
    const fullTime = baseMatch({
      status: 'full_time',
      started_at: live.started_at,
      ended_at: new Date().toISOString(),
      duration_minutes: 40,
    });
    matchesApi.getMatch.mockResolvedValueOnce(live).mockResolvedValueOnce(fullTime);
    matchesApi.endMatch.mockResolvedValue(fullTime);

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /end match/i });
    await user.click(screen.getByRole('button', { name: /end match/i }));

    await waitFor(() =>
      expect(screen.getByTestId('timer-status')).toHaveTextContent(/full time • timer stopped/i)
    );
    expect(screen.getByTestId('timer-display')).not.toHaveTextContent('40:00');
  });

  it('resets the timer to 00:00 when Reset to 00:00 button is clicked', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ status: 'live' }));
    const user = userEvent.setup();
    renderPage();

    const resetBtn = await screen.findByRole('button', { name: /reset to 00:00/i });
    await user.click(resetBtn);
    expect(screen.getByTestId('timer-display')).toHaveTextContent('00:00');
  });

  // handleHalfTime/handleResume now correctly wait for the API call to
  // resolve (and re-fetch the match) before updating the displayed state —
  // see AdminLiveControlPage.jsx's comment above handleHalfTime for why
  // (Timer/Half-Time audit: the old optimistic-then-swallow-errors pattern
  // could show "paused" even when the server call had failed). These tests
  // mock the sequence of getMatch() responses (initial load, then reload
  // after each action) the same way the existing start/end tests above do.
  it('shows Half Time button for a live match and pauses timer when clicked', async () => {
    const live = baseMatch({ status: 'live' });
    const paused = baseMatch({ status: 'live', is_half_time: true, elapsed_seconds: 120 });
    matchesApi.getMatch.mockResolvedValueOnce(live).mockResolvedValueOnce(paused);
    matchesApi.pauseHalfTime.mockResolvedValue(paused);

    const user = userEvent.setup();
    renderPage();

    const halfTimeBtn = await screen.findByRole('button', { name: /half time/i });
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/live • timer running/i);
    expect(screen.getByTestId('timer-live-dot')).toBeInTheDocument();

    await user.click(halfTimeBtn);

    await waitFor(() => expect(matchesApi.pauseHalfTime).toHaveBeenCalledWith('m1', expect.any(Object)));
    await waitFor(() =>
      expect(screen.getByTestId('timer-status')).toHaveTextContent(/half time • timer paused/i)
    );
    expect(screen.getByTestId('timer-halftime-dot')).toBeInTheDocument();
    expect(screen.queryByTestId('timer-live-dot')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /half time/i })).not.toBeInTheDocument();
  });

  it('surfaces an error instead of showing paused if the half-time request fails', async () => {
    matchesApi.getMatch.mockResolvedValue(baseMatch({ status: 'live' }));
    matchesApi.pauseHalfTime.mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    renderPage();

    const halfTimeBtn = await screen.findByRole('button', { name: /half time/i });
    await user.click(halfTimeBtn);

    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument());
    // Still shows live/running, not half time — the failed call never took effect.
    expect(screen.getByTestId('timer-status')).toHaveTextContent(/live • timer running/i);
    expect(screen.getByRole('button', { name: /half time/i })).toBeInTheDocument();
  });

  it('resumes the timer when Resume is clicked after Half Time', async () => {
    const paused = baseMatch({ status: 'live', is_half_time: true, elapsed_seconds: 120 });
    const resumed = baseMatch({ status: 'live', is_half_time: false });
    matchesApi.getMatch.mockResolvedValueOnce(paused).mockResolvedValueOnce(resumed);
    matchesApi.resumeMatch.mockResolvedValue(resumed);

    const user = userEvent.setup();
    renderPage();

    const resumeBtn = await screen.findByRole('button', { name: /resume/i });
    await user.click(resumeBtn);

    await waitFor(() => expect(matchesApi.resumeMatch).toHaveBeenCalledWith('m1'));
    await waitFor(() =>
      expect(screen.getByTestId('timer-status')).toHaveTextContent(/live • timer running/i)
    );
    expect(screen.getByTestId('timer-live-dot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /half time/i })).toBeInTheDocument();
  });

  it('allows End Match to be clicked while paused in Half Time', async () => {
    const paused = baseMatch({ status: 'live', is_half_time: true, elapsed_seconds: 120 });
    const fullTime = baseMatch({ status: 'full_time' });
    matchesApi.getMatch.mockResolvedValueOnce(paused).mockResolvedValueOnce(fullTime);
    matchesApi.endMatch.mockResolvedValue(fullTime);

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: /resume/i });
    const endBtn = screen.getByRole('button', { name: /end match/i });
    await user.click(endBtn);

    await waitFor(() => expect(matchesApi.endMatch).toHaveBeenCalledWith('m1'));
    await waitFor(() =>
      expect(screen.getByTestId('timer-status')).toHaveTextContent(/full time • timer stopped/i)
    );
  });
});


