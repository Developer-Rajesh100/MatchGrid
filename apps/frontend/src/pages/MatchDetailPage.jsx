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

      // Scoped fetch for only this match's two teams to prevent unnecessary load
      const teamIds = [data.team1_id, data.team2_id].filter(Boolean);
      const rosters = await Promise.all(teamIds.map((teamId) => playersApi.getPlayers({ team_id: teamId, tournament_id: data.tournament_id })));
      const pMap = {};
      rosters.flat().forEach((p) => {
        pMap[p.id] = p;
      });
      setPlayersMap(pMap);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load match details');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadMatch(true);
  }, [matchId]);

  useLiveSocket((msg) => {
    if (!msg.match_id || msg.match_id === matchId) {
      loadMatch(false);
    }
  }, match?.tournament_id);

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
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
            Match #{match.match_number} {label ? `&bull; ${label}` : ''}
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

        {/* Score & Teams Display */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            margin: '20px 0',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Team 1 */}
          <div
            onClick={() => match.team1_id && navigate(tPath(match.tournament_slug || contextSlug, `teams/${match.team1_id}`))}
            style={{ textAlign: 'center', flex: '1 1 180px', cursor: match.team1_id ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <Avatar
                name={match.team1_name || 'TBD'}
                photoUrl={match.team1_logo}
                size={58}
                color={match.team1_color || '#10B981'}
              />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {match.team1_name || 'TBD'}
            </div>
            {match.winner_id === match.team1_id && (
              <span className="pill pill-full-time" style={{ marginTop: '8px', fontSize: '10px' }}>
                Winner
              </span>
            )}
          </div>

          {/* Big Score Header */}
          <div style={{ textAlign: 'center', padding: '0 24px' }}>
            {isPlayed ? (
              <div
                className="hero-score"
                style={{ fontSize: '52px', letterSpacing: '2px', lineHeight: 1 }}
              >
                {match.score1 ?? 0} &ndash; {match.score2 ?? 0}
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '36px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                VS
              </div>
            )}
            <div
              style={{
                fontSize: '12px',
                color: match.is_half_time ? 'var(--accent-gold)' : 'var(--text-muted)',
                marginTop: '8px',
                fontWeight: match.is_half_time ? 700 : 600,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
              }}
            >
              {match.status === 'live'
                ? match.is_half_time
                  ? 'HALF TIME'
                  : 'MATCH IN PROGRESS'
                : match.status === 'full_time'
                ? 'FULL TIME'
                : 'UPCOMING'}
            </div>
          </div>

          {/* Team 2 */}
          <div
            onClick={() => match.team2_id && navigate(tPath(match.tournament_slug || contextSlug, `teams/${match.team2_id}`))}
            style={{ textAlign: 'center', flex: '1 1 180px', cursor: match.team2_id ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <Avatar
                name={match.team2_name || 'TBD'}
                photoUrl={match.team2_logo}
                size={58}
                color={match.team2_color || '#34D399'}
              />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {match.team2_name || 'TBD'}
            </div>
            {match.winner_id === match.team2_id && (
              <span className="pill pill-full-time" style={{ marginTop: '8px', fontSize: '10px' }}>
                Winner
              </span>
            )}
          </div>
        </div>

        {/* Public Match Timer Display (Audience Read-Only) */}
        {(match.status === 'live' || match.status === 'full_time') && (
          <div
            className="admin-timer-card"
            data-testid="public-match-timer"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '20px auto',
              padding: '16px 28px',
              maxWidth: '360px',
              width: '100%',
              textAlign: 'center',
              boxShadow: 'inset 0 1px 4px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Clock
                size={15}
                color={
                  match.status === 'live'
                    ? match.is_half_time
                      ? 'var(--accent-gold)'
                      : 'var(--status-live)'
                    : 'var(--brand-primary)'
                }
              />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: 'var(--text-secondary)',
                }}
              >
                Match Timer
              </span>
              {match.status === 'live' && !match.is_half_time && (
                <span
                  className="pulse-live"
                  data-testid="timer-live-dot"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--status-live)',
                    display: 'inline-block',
                    boxShadow: '0 0 8px var(--status-live)',
                  }}
                />
              )}
              {match.status === 'live' && match.is_half_time && (
                <span
                  data-testid="timer-halftime-dot"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--accent-gold)',
                    display: 'inline-block',
                  }}
                  title="Paused for Half Time"
                />
              )}
            </div>

            <div
              data-testid="timer-display"
              className="timer-display"
              style={{
                fontSize: '40px',
                fontWeight: 700,
                letterSpacing: '2px',
                lineHeight: 1.1,
                color:
                  match.status === 'live'
                    ? match.is_half_time
                      ? 'var(--accent-gold)'
                      : 'var(--status-live)'
                    : 'var(--text-primary)',
              }}
            >
              {timerUnknown ? '—' : formatTime(timerSeconds)}
            </div>

            <div
              data-testid="timer-status"
              style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color:
                  match.status === 'live'
                    ? match.is_half_time
                      ? 'var(--accent-gold)'
                      : 'var(--status-live)'
                    : 'var(--text-secondary)',
                marginTop: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
              }}
            >
              {match.status === 'live'
                ? match.is_half_time
                  ? 'Half Time • Timer Paused'
                  : 'Live • Timer Running'
                : 'Full Time • Timer Stopped'}
            </div>
          </div>
        )}

        {/* Goal Scorers Summary Panel */}
        {isPlayed && (team1Goals.length > 0 || team2Goals.length > 0) && (
          <div
            className="goal-scorer-panel"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '24px',
              padding: '14px 20px',
              background: 'var(--bg-elevated)',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              marginBottom: '18px',
              fontSize: '13px',
            }}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left' }}>
              {team1Goals.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚽</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{g.player_name}</span>
                  {g.minute && <span style={{ color: 'var(--brand-primary)', fontSize: '11.5px', fontWeight: 700 }}>{g.minute}'</span>}
                  {g.assist_player_name && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>({g.assist_player_name})</span>
                  )}
                </div>
              ))}
            </div>
            <div className="goal-scorer-panel-team2" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'right', alignItems: 'flex-end' }}>
              {team2Goals.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {g.assist_player_name && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>({g.assist_player_name})</span>
                  )}
                  {g.minute && <span style={{ color: 'var(--brand-primary)', fontSize: '11.5px', fontWeight: 700 }}>{g.minute}'</span>}
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{g.player_name}</span>
                  <span>⚽</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tied Knockout Match Note */}
        {isKnockout && isDrawn && (
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--accent-gold-tint)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '8px',
              marginBottom: '18px',
              textAlign: 'center',
              fontSize: '13.5px',
              color: 'var(--accent-gold)',
            }}
          >
            {winnerName ? (
              <span>
                <strong>Tied at full time</strong> &mdash; Knockout Progression Winner: <strong>{winnerName}</strong>
              </span>
            ) : (
              <span>
                <strong>Tied at full time</strong> &mdash; Penalty shootout decision pending operator input
              </span>
            )}
          </div>
        )}

        {/* Match metadata bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '16px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
          }}
        >
          {match.date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} color="var(--brand-primary)" /> {match.date}
            </span>
          )}
          {match.time && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="var(--brand-primary)" /> {match.time}
            </span>
          )}
          {match.venue && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={14} color="var(--brand-primary)" /> {match.venue}
            </span>
          )}
        </div>
      </div>

      {/* Player of the Match banner if awarded */}
      {potmEvent && (
        <div
          className="card"
          style={{
            marginBottom: '24px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14), var(--bg-surface))',
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
                      <span style={{ fontSize: '16px' }}>
                        {evt.type === 'goal' ? '⚽' : evt.type === 'yellow' ? '🟨' : evt.type === 'red' ? '🟥' : '•'}
                      </span>
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
