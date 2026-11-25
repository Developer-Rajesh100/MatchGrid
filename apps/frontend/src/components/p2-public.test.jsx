import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TournamentContext from '../context/TournamentContext';
import { Scoreboard } from './match/Scoreboard';
import { StandingsTable } from './standings/StandingsTable';
import { MatchRow } from './match/MatchRow';
import { LeaderCard } from './stats/LeaderCard';
import { LoadingState } from './common/Common';
import TournamentBracket from './bracket/TournamentBracket';
import { StandingsPage } from '../pages/StandingsPage';
import { matchesApi } from '../api/matches';
import { standingsApi } from '../api/standings';

vi.mock('../api/matches', () => ({ matchesApi: { getBracket: vi.fn() } }));
vi.mock('../api/standings', () => ({ standingsApi: { getStandings: vi.fn() } }));
vi.mock('../hooks/useLiveSocket', () => ({ useLiveSocket: () => ({ connected: false }) }));

const config = (over = {}) => ({
  points_win: 3, points_draw: 1, points_loss: 0, knockout_format: 'semis_final',
  qualifiers_per_group: 2, num_groups: 2, ...over,
});

function withTournament(ui, tournament = { slug: 'cup', config: config() }) {
  return (
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournament, tournamentId: 't1', slug: 'cup' }}>{ui}</TournamentContext.Provider>
    </MemoryRouter>
  );
}

const MATCH = {
  id: 'm1', status: 'live', stage: 'group', group_name: 'A', match_number: 7,
  team1_id: 'a', team2_id: 'b', team1_name: 'Red Dragons', team2_name: 'Blue Whales',
  team1_color: '#EF4444', team2_color: '#3B82F6', score1: 2, score2: 1,
};

describe('Scoreboard', () => {
  it('keeps both teams, the score and the footer on one grid, with the team colour as a bar variable', () => {
    const { container } = render(<Scoreboard match={MATCH} center={<span>clock here</span>} />);
    expect(container.querySelector('.scoreboard__score')).toHaveTextContent('2–1');
    expect(container.querySelector('.scoreboard__footer')).toHaveTextContent('clock here');
    const [home, away] = container.querySelectorAll('.sb-team');
    expect(home.style.getPropertyValue('--team-color')).toBe('#EF4444');
    expect(away.style.getPropertyValue('--team-color')).toBe('#3B82F6');
    expect(home).toHaveTextContent('Red Dragons');
  });

  it('shows "vs" before kick-off, and (P) beside the side that won a level knockout on penalties', () => {
    const { rerender, container } = render(<Scoreboard match={{ ...MATCH, status: 'upcoming' }} />);
    expect(container.querySelector('.scoreboard__score')).toHaveTextContent('vs');
    rerender(
      <Scoreboard match={{ ...MATCH, status: 'full_time', stage: 'final', score1: 1, score2: 1, winner_id: 'b' }} />
    );
    expect(screen.getByText(/\(P\)/)).toBeInTheDocument();
    expect(container.querySelectorAll('.sb-team')[1]).toHaveClass('is-winner');
  });

  it('makes team names clickable only when a handler and a team exist', () => {
    const onTeam = vi.fn();
    render(<Scoreboard match={MATCH} onTeamClick={onTeam} />);
    fireEvent.click(screen.getByRole('button', { name: /Blue Whales/ }));
    expect(onTeam).toHaveBeenCalledWith('b');
    expect(screen.queryAllByRole('button')).toHaveLength(2);
  });
});

describe('StandingsTable', () => {
  const rows = [
    { team_id: 'a', team_name: 'Red Dragons', team_color: '#EF4444', played: 3, won: 2, drawn: 1, lost: 0, goals_for: 7, goals_against: 3, goal_difference: 4, points: 7 },
    { team_id: 'b', team_name: 'Blue Whales', team_color: '#3B82F6', played: 3, won: 1, drawn: 0, lost: 2, goals_for: 2, goals_against: 5, goal_difference: -3, points: 3 },
    { team_id: 'c', team_name: 'Green Lions', team_color: '#22C55E', played: 3, won: 0, drawn: 0, lost: 3, goals_for: 1, goals_against: 2, goal_difference: 0, points: 0 },
  ];

  it('marks exactly the configured number of qualifying places, with the legend from the settings', () => {
    const { container } = render(withTournament(<StandingsTable groupName="A" standings={rows} />, { slug: 'cup', config: config({ qualifiers_per_group: 1, knockout_format: 'quarters_semis_final' }) }));
    expect(container.querySelectorAll('tr.is-advancing')).toHaveLength(1);
    expect(screen.getByText(/Top 1 advance to the quarter-finals/)).toBeInTheDocument();
  });

  it('shows no qualification mark or legend when there is no knockout', () => {
    const { container } = render(withTournament(<StandingsTable groupName="A" standings={rows} />, { slug: 'cup', config: config({ knockout_format: 'none' }) }));
    expect(container.querySelectorAll('tr.is-advancing')).toHaveLength(0);
    expect(screen.queryByText(/advance/i)).not.toBeInTheDocument();
  });

  it('uses the tabular numeral face for every number and signs the goal difference', () => {
    const { container } = render(withTournament(<StandingsTable groupName="A" standings={rows} />));
    const cells = container.querySelectorAll('tbody td.num');
    expect(cells.length).toBe(rows.length * 9); // pos, P, W, D, L, GF, GA, GD, Pts
    expect(screen.getByText('+4')).toHaveClass('is-pos');
    expect(screen.getByText('-3')).toHaveClass('is-neg');
    expect(container.querySelectorAll('.hide-sm').length).toBe(2 + rows.length * 2); // GF and GA collapse on phones
  });

  it('says so when a group has no rows yet', () => {
    render(withTournament(<StandingsTable groupName="C" standings={[]} />));
    expect(screen.getByText(/No standings recorded for Group C yet/)).toBeInTheDocument();
  });
});

describe('StandingsPage rules text comes from the tournament, not from hard-coded points', () => {
  it('describes custom points and a league with no knockout', async () => {
    standingsApi.getStandings.mockResolvedValue([{ group_id: 'g', group_name: 'A', standings: [] }]);
    render(withTournament(<StandingsPage />, { slug: 'cup', config: config({ points_win: 2, points_draw: 1, points_loss: 0, knockout_format: 'none' }) }));
    expect(await screen.findByText(/2 points for a win, 1 point for a draw and 0 points for a defeat/)).toBeInTheDocument();
    expect(screen.getByText(/no knockout stage/)).toBeInTheDocument();
    expect(screen.queryByText(/Semi-final 1/)).not.toBeInTheDocument();
  });

  it('keeps the official A2-v-B1 pairing only for two groups of two qualifiers', async () => {
    standingsApi.getStandings.mockResolvedValue([
      { group_id: 'g1', group_name: 'A', standings: [] },
      { group_id: 'g2', group_name: 'B', standings: [] },
    ]);
    const { unmount } = render(withTournament(<StandingsPage />));
    expect(await screen.findByText(/Semi-final 1 is Group A 2nd vs Group B 1st/)).toBeInTheDocument();
    unmount();
    standingsApi.getStandings.mockResolvedValue(['A', 'B', 'C', 'D'].map((n) => ({ group_id: n, group_name: n, standings: [] })));
    render(withTournament(<StandingsPage />, { slug: 'cup', config: config({ num_groups: 4, qualifiers_per_group: 1 }) }));
    expect(await screen.findByText(/Pairings are seeded from the final group tables/)).toBeInTheDocument();
    expect(screen.queryByText(/Group A 2nd/)).not.toBeInTheDocument();
  });
});

describe('MatchRow', () => {
  it('shows scores for played matches, a dash before kick-off, and opens the tournament-scoped match page', () => {
    const { rerender } = render(withTournament(<MatchRow match={{ ...MATCH, status: 'full_time', winner_id: 'a', date: '2026-11-22', time: '10:00' }} />));
    const row = screen.getByRole('link');
    expect(within(row).getByText('Match #7')).toBeInTheDocument();
    expect(within(row).getByText('Group A')).toBeInTheDocument();
    expect(within(row).getByText('10:00')).toBeInTheDocument();
    expect(within(row).getAllByText(/^[0-9]$/).map((e) => e.textContent)).toEqual(['2', '1']);
    rerender(withTournament(<MatchRow match={{ ...MATCH, status: 'upcoming', score1: null, score2: null }} />));
    expect(within(screen.getByRole('link')).getAllByText('–')).toHaveLength(2);
  });
});

describe('LeaderCard', () => {
  it('lists leaders with tabular values, gold only on the first, and an empty state', () => {
    const { container, rerender } = render(
      withTournament(<LeaderCard title="Golden Boot" unit="goals" items={[{ player_id: 'p1', player_name: 'Oscar Kim', team_name: 'Cedar Park', value: 3 }, { player_id: 'p2', player_name: 'Idris Ivanov', team_name: 'Maplewood', value: 2 }]} limit={4} />)
    );
    expect(container.querySelectorAll('.leader-row')).toHaveLength(2);
    expect(container.querySelector('.leader-row.is-first')).toHaveTextContent('Oscar Kim');
    expect(container.querySelectorAll('.leader-row__value .num')[0]).toHaveTextContent('3');
    rerender(withTournament(<LeaderCard title="Golden Boot" items={[]} />));
    expect(screen.getByText(/No stats recorded/)).toBeInTheDocument();
  });
});

describe('LoadingState', () => {
  it('is a skeleton with the message kept for screen readers, not a spinner', () => {
    const { container } = render(<LoadingState message="Loading match center..." />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading match center...');
    expect(container.querySelector('.spinner')).toBeNull();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(2);
  });
});

describe('TournamentBracket structure', () => {
  const team = (id, name) => ({ id, name, color: '#10B981' });
  const sf = (slot, extra = {}) => ({ bracket_slot: slot, match_id: `m-${slot}`, stage: 'semi', status: 'upcoming', score1: 0, score2: 0, team1: team(`${slot}a`, `${slot} Home`), team2: team(`${slot}b`, `${slot} Away`), ...extra });

  it('fills in the rounds that are not seeded yet and pairs the matches that feed one another', async () => {
    matchesApi.getBracket.mockResolvedValue({
      tournament_id: 't1', knockout_format: 'quarters_semis_final', champion: null,
      rounds: [{ round_order: 1, round_name: 'Quarter-finals', matches: ['QF1', 'QF2', 'QF3', 'QF4'].map((s) => sf(s, { stage: 'quarter' })) }],
    });
    const { container } = render(withTournament(<TournamentBracket tournamentId="t1" />));
    expect(await screen.findByTestId('tournament-bracket')).toBeInTheDocument();
    expect(screen.getByTestId('bracket-round-2')).toHaveTextContent('Semi-finals');
    expect(screen.getByTestId('bracket-round-3')).toHaveTextContent('Final');
    expect(screen.getByTestId('match-card-SF1')).toHaveTextContent('TBD');
    expect(container.querySelectorAll('.bracket-round-column')).toHaveLength(3);
    // QF1+QF2 and QF3+QF4 share a connector; SF1+SF2 share one; the final stands alone
    const pairs = [...container.querySelectorAll('.bracket-pair')];
    expect(pairs.map((p) => p.classList.contains('is-pair'))).toEqual([true, true, true, false]);
    expect(container.querySelectorAll('.has-next')).toHaveLength(2); // the final has no next round
  });

  it('marks the penalty winner with (P) and counts played matches in the round header', async () => {
    matchesApi.getBracket.mockResolvedValue({
      tournament_id: 't1', knockout_format: 'semis_final', champion: null,
      rounds: [
        { round_order: 1, round_name: 'Semi-finals', matches: [sf('SF1', { status: 'full_time', score1: 1, score2: 1, winner_id: 'SF1b' }), sf('SF2')] },
        { round_order: 2, round_name: 'Final', matches: [{ bracket_slot: 'FINAL', match_id: 'mf', stage: 'final', status: 'upcoming', score1: 0, score2: 0, team1: null, team2: null }] },
      ],
    });
    render(withTournament(<TournamentBracket tournamentId="t1" />));
    const card = await screen.findByTestId('match-card-SF1');
    expect(within(card).getByTitle('Won on penalties')).toBeInTheDocument();
    expect(screen.getByTestId('bracket-round-1')).toHaveTextContent('1/2');
  });

  it('shows a swipe hint until the bracket has been scrolled, and the scroll area is keyboard reachable', async () => {
    matchesApi.getBracket.mockResolvedValue({
      tournament_id: 't1', knockout_format: 'semis_final', champion: null,
      rounds: [{ round_order: 1, round_name: 'Semi-finals', matches: [sf('SF1'), sf('SF2')] }, { round_order: 2, round_name: 'Final', matches: [] }],
    });
    render(withTournament(<TournamentBracket tournamentId="t1" />));
    const region = await screen.findByRole('region', { name: /bracket/i });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(/Swipe to follow the bracket/)).toBeInTheDocument();
    Object.defineProperty(region, 'scrollLeft', { value: 80, configurable: true });
    fireEvent.scroll(region);
    expect(screen.queryByText(/Swipe to follow the bracket/)).not.toBeInTheDocument();
  });
});
