import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { matchesApi } from '../api/matches';
import { playersApi } from '../api/players';
import { authApi } from '../api/auth';
import { Avatar } from '../components/common/Avatar';
import { StatusPill } from '../components/common/StatusPill';
import { LoadingState, ErrorState } from '../components/common/Common';
import { Calendar, Clock, MapPin, Award, ArrowLeft, Settings, Shield } from 'lucide-react';
import { useLiveSocket } from '../hooks/useLiveSocket';
import { formatTime } from '../utils/time';
import { clockOffsetMs, matchElapsedSeconds } from '../utils/clock';
import { useTournament } from '../context/TournamentContext';
import { tPath } from '../utils/paths';
import { EventIcon } from '../components/common/EventIcon';
import { Scoreboard } from '../components/match/Scoreboard';
import { formatDay } from '../utils/dates';
import { stageLabel } from '../utils/matchLabels';

export function MatchDetailPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { slug: contextSlug } = useTournament();
  const [match, setMatch] = useState(null);
  const [playersMap, setPlayersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const clockOffsetRef = useRef(0);
  const rosterKeyRef = useRef(null);
  // True only for a full_time match with no recorded duration anywhere (audit finding L-4)
  const [timerUnknown, setTimerUnknown] = useState(false);
  const isAdmin = authApi.isAuthenticated();

  const loadMatch = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await matchesApi.getMatch(matchId);
      clockOffsetRef.current = clockOffsetMs(data, Date.now());
      setMatch(data);

      // The two squads only change when the match's teams do: live updates (goals, clock) reuse them.
      const teamIds = [data.team1_id, data.team2_id].filter(Boolean);
      const rosterKey = `${data.tournament_id}:${teamIds.join(',')}`;
      if (rosterKeyRef.current !== rosterKey) {
        const rosters = await Promise.all(
          teamIds.map((teamId) => playersApi.getPlayers({ team_id: teamId, tournament_id: data.tournament_id }))
        );
        const pMap = {};
        rosters.flat().forEach((p) => {
          pMap[p.id] = p;
        });
        setPlayersMap(pMap);
        rosterKeyRef.current = rosterKey;
      }
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load match details');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadMatch(true);
  }, [matchId]);

  useLiveSocket(() => loadMatch(false), match?.tournament_id, {
    enabled: Boolean(match?.tournament_id),
    filter: (msg) => !msg.match_id || msg.match_id === matchId,
  });

  // Public match clock: server fields + the server's own "now" only (see utils/clock.js).
  useEffect(() => {
    if (!match) return undefined;
    const compute = () => matchElapsedSeconds(match, clockOffsetRef.current);
    const initial = compute();
    setTimerUnknown(initial === null);
    setTimerSeconds(initial ?? 0);
    if (match.status === 'live' && !match.is_half_time) {
      const interval = setInterval(() => setTimerSeconds(compute() ?? 0), 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [match]);

  if (loading) return <LoadingState message="Loading match center..." />;
  if (error || !match) return <ErrorState message={error || 'Match not found'} onRetry={() => loadMatch(true)} />;

  const isPlayed = match.status === 'full_time' || match.status === 'live';
  const label =
    match.label ||
    (match.group_name
      ? `Group ${match.group_name}`
      : match.stage === 'semi'
      ? 'Semi-final'
      : match.stage === 'final'
      ? 'Final'
      : match.stage === 'extra'
      ? 'Friendly'
      : '');

  const events = match.events || [];
  const potmEvent = events.find((e) => e.type === 'potm');
  const matchEvents = events.filter((e) => e.type !== 'potm');

  const lineupPlayers = (match.lineup || [])
    .map((pid) => playersMap[pid])
    .filter(Boolean);

  const team1Lineup = lineupPlayers.filter((p) => p.team_id === match.team1_id);
  const team2Lineup = lineupPlayers.filter((p) => p.team_id === match.team2_id);

  const isKnockout = match.stage === 'semi' || match.stage === 'final';
  const isDrawn = isPlayed && match.score1 !== null && match.score2 !== null && match.score1 === match.score2;
  const team1Goals = events.filter((e) => e.type === 'goal' && e.team_id === match.team1_id);
  const team2Goals = events.filter((e) => e.type === 'goal' && e.team_id === match.team2_id);
  const winnerName = match.winner_id
    ? match.winner_id === match.team1_id
      ? match.team1_name
      : match.team2_name
    : null;

  return (
    <div>
      <button
        onClick={() => navigate(tPath(match?.tournament_slug || contextSlug, 'matches'))}
        className="btn btn-outline btn-sm"
        style={{ marginBottom: '18px' }}
      >
        <ArrowLeft size={13} /> Back to Fixtures
      </button>

      {/* Main Match Header Card */}
      <div className="card" style={{ marginBottom: '24px', padding: '28px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span className="match-title">
            <span className="match-title__no">Match #{match.match_number}</span>
            {stageLabel(match) && <span className="match-title__stage">{stageLabel(match)}</span>}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <StatusPill status={match.status} isHalfTime={Boolean(match.is_half_time)} />
            {isAdmin && (
              <NavLink
                to={`/scorer/matches/${match.id}/live`}
                className="btn btn-sm btn-primary"
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                <Settings size={12} /> Live Scorer
              </NavLink>
            )}
          </div>
        </div>

        {/* Scoreboard: one axis at every width, team colour as the 3px bar on each outer edge */}
        <Scoreboard
          match={match}
          variant="public"
          onTeamClick={(teamId) => navigate(tPath(match.tournament_slug || contextSlug, `teams/${teamId}`))}
          center={
            (match.status === 'live' || match.status === 'full_time') && (
              <div
                className={`sb-clock sb-clock--${match.status === 'live' ? (match.is_half_time ? 'ht' : 'live') : 'ft'}`}
                data-testid="public-match-timer"
              >
                <span className="sb-clock__row">
                  <Clock size={14} aria-hidden="true" />
                  <span data-testid="timer-display" className="timer-display num sb-clock__time">
                    {timerUnknown ? '—' : formatTime(timerSeconds)}
                  </span>
                  {match.status === 'live' && !match.is_half_time && (
                    <span className="live-dot" data-testid="timer-live-dot" />
                  )}
                  {match.status === 'live' && match.is_half_time && (
                    <span className="sb-dot-ht" data-testid="timer-halftime-dot" title="Paused for Half Time" />
                  )}
                </span>
                <span data-testid="timer-status" className="sb-clock__state">
                  {match.status === 'live'
                    ? match.is_half_time
                      ? 'Half Time • Timer Paused'
                      : 'Live • Timer Running'
                    : 'Full Time • Timer Stopped'}
                </span>
              </div>
            )
          }
        />

        {isPlayed && (team1Goals.length > 0 || team2Goals.length > 0) && (
          <div className="goal-summary goal-scorer-panel">
            <ul className="goal-summary__side">
              {team1Goals.map((g) => (
                <li key={g.id}>
                  <EventIcon type="goal" size={14} />
                  <span className="goal-summary__name">{g.player_name}</span>
                  {g.minute && <span className="goal-summary__min num">{g.minute}'</span>}
                  {g.assist_player_name && <span className="goal-summary__assist">({g.assist_player_name})</span>}
                </li>
              ))}
            </ul>
            <ul className="goal-summary__side goal-summary__side--away goal-scorer-panel-team2">
              {team2Goals.map((g) => (
                <li key={g.id}>
                  {g.assist_player_name && <span className="goal-summary__assist">({g.assist_player_name})</span>}
                  {g.minute && <span className="goal-summary__min num">{g.minute}'</span>}
                  <span className="goal-summary__name">{g.player_name}</span>
                  <EventIcon type="goal" size={14} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {isKnockout && isDrawn && (
          <div className="tie-note">
            {winnerName ? (
              <span>
                <strong>Tied at full time</strong> &mdash; Knockout Progression Winner: <strong>{winnerName}</strong> (P)
              </span>
            ) : (
              <span>
                <strong>Tied at full time</strong> &mdash; Penalty shootout decision pending operator input
              </span>
            )}
          </div>
        )}

        <div className="match-facts">
          {match.date && (
            <span><Calendar size={14} aria-hidden="true" /> {formatDay(match.date)}</span>
          )}
          {match.time && (
            <span><Clock size={14} aria-hidden="true" /> {match.time}</span>
          )}
          {match.venue && (
            <span><MapPin size={14} aria-hidden="true" /> {match.venue}</span>
          )}
        </div>
      </div>

      {/* Player of the Match banner if awarded */}
      {potmEvent && (
        <div
          className="card"
          style={{
            marginBottom: '24px',
            background: 'var(--bg-surface)',
            borderColor: 'rgba(245, 158, 11, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'var(--accent-gold)',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Award size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--accent-gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Player of the Match
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {potmEvent.player_name}
            </div>
          </div>
        </div>
      )}

      {/* Match Events Timeline & Lineups Grid */}
      <div className="grid-2">
        {/* Events Timeline */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, marginBottom: '18px', color: 'var(--text-primary)' }}>
            Chronological Timeline
          </h3>

          {matchEvents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {matchEvents.map((evt) => {
                const isTeam1 = evt.team_id === match.team1_id;
                return (
                  <div
                    key={evt.id}
                    className="event-item"
                    style={{
                      borderLeft: isTeam1 ? `4px solid ${match.team1_color || '#10B981'}` : '1px solid var(--border-subtle)',
                      borderRight: !isTeam1 ? `4px solid ${match.team2_color || '#34D399'}` : '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="event-minute">{evt.minute ? `${evt.minute}'` : '•'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <EventIcon type={evt.type} size={17} />
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{evt.player_name}</span>
                        {evt.assist_player_name && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                            (assist: {evt.assist_player_name})
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px', textTransform: 'capitalize' }}>
                          {evt.type}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', textAlign: 'center', padding: '28px' }}>
              {isPlayed ? 'No timeline events recorded for this fixture.' : 'Events will appear chronologically once the match starts.'}
            </p>
          )}
        </div>

        {/* Team Lineups */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, marginBottom: '18px', color: 'var(--text-primary)' }}>
            Match Squad Lineups
          </h3>

          {lineupPlayers.length > 0 ? (
            <div className="grid-2" style={{ gap: '20px' }}>
              {/* Team 1 squad */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} /> {match.team1_name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {team1Lineup.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-secondary)', width: '20px' }}>
                        #{p.number}
                      </span>
                      <span style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    </div>
                  ))}
                  {team1Lineup.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None recorded</span>}
                </div>
              </div>

              {/* Team 2 squad */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', color: 'var(--brand-primary-hover)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} /> {match.team2_name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {team2Lineup.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-secondary)', width: '20px' }}>
                        #{p.number}
                      </span>
                      <span style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    </div>
                  ))}
                  {team2Lineup.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None recorded</span>}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', textAlign: 'center', padding: '28px' }}>
              No lineup information submitted for this match yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default MatchDetailPage;
