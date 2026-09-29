import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { matchesApi } from '../api/matches';
import { playersApi } from '../api/players';
import { authApi } from '../api/auth';
import { Avatar } from '../components/common/Avatar';
import { StatusPill } from '../components/common/StatusPill';
import { LoadingState, ErrorState } from '../components/common/Common';
import { Calendar, Clock, MapPin, Award, ArrowLeft, Settings } from 'lucide-react';
import { useLiveSocket } from '../hooks/useLiveSocket';
import { formatTime } from '../utils/time';

export function MatchDetailPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [playersMap, setPlayersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  // True only for a full_time match with no recorded duration anywhere —
  // distinguishes "duration genuinely wasn't recorded" from "the match
  // lasted 0 seconds" (audit finding L-4).
  const [timerUnknown, setTimerUnknown] = useState(false);
  const isAdmin = authApi.isAuthenticated();

  const loadMatch = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await matchesApi.getMatch(matchId);
      setMatch(data);

      // Fetch players for just this match's two teams (not the whole
      // tournament roster) to map lineup IDs to names — scoped fetch found
      // during the Timer/Half-Time audit (L-5); a knockout match with a TBD
      // slot may have only one team assigned yet.
      const teamIds = [data.team1_id, data.team2_id].filter(Boolean);
      const rosters = await Promise.all(teamIds.map((teamId) => playersApi.getPlayers({ team_id: teamId })));
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
  });

  // Public Match Timer Synchronization
  useEffect(() => {
    if (!match) return;

    const timerStorageKey = `dcl_timer_${match.id}`;

    if (match.status === 'upcoming' || match.status === 'cancelled') {
      setTimerSeconds(0);
      setTimerUnknown(false);
      return;
    }

    if (match.status === 'full_time') {
      let finalSec = null;
      if (match.started_at && match.ended_at) {
        finalSec = Math.max(
          0,
          Math.floor((new Date(match.ended_at).getTime() - new Date(match.started_at).getTime()) / 1000)
        );
      } else if (typeof match.elapsed_seconds === 'number') {
        finalSec = match.elapsed_seconds;
      } else {
        try {
          const saved = JSON.parse(localStorage.getItem(timerStorageKey) || '{}');
          if (typeof saved.elapsed === 'number') finalSec = saved.elapsed;
        } catch {
          // ignore
        }
      }
      const unknown = finalSec === null;
      setTimerUnknown(unknown);
      setTimerSeconds(unknown ? 0 : finalSec);
      return;
    }

    setTimerUnknown(false);
    if (match.status === 'live') {
      if (match.is_half_time) {
        let pausedSec = match.elapsed_seconds;
        if (typeof pausedSec !== 'number') {
          try {
            const saved = JSON.parse(localStorage.getItem(timerStorageKey) || '{}');
            if (typeof saved.elapsed === 'number') pausedSec = saved.elapsed;
          } catch {
            // ignore
          }
        }
        setTimerSeconds(pausedSec || 0);
        return;
      }

      const getElapsed = () => {
        if (match.started_at) {
          const startMs = new Date(match.started_at).getTime();
          return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        }
        if (typeof match.elapsed_seconds === 'number') {
          return match.elapsed_seconds;
        }
        try {
          const saved = JSON.parse(localStorage.getItem(timerStorageKey) || 'null');
          if (saved && saved.startedAt) {
            return (saved.elapsedBefore || 0) + Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000));
          }
        } catch {
          // ignore
        }
        return 0;
      };

      setTimerSeconds(getElapsed());
      const interval = setInterval(() => {
        setTimerSeconds(getElapsed());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [match?.id, match?.status, match?.started_at, match?.ended_at, match?.is_half_time, match?.elapsed_seconds]);

  if (loading) return <LoadingState message="Loading match details..." />;
  if (error || !match) return <ErrorState message={error || 'Match not found'} onRetry={loadMatch} />;

  const isPlayed = match.status === 'full_time' || match.status === 'live' || match.status === 'completed';
  const label =
    match.label ||
    (match.group_name ? `Group ${match.group_name}` : match.stage === 'semi' ? 'Semi-final' : match.stage === 'final' ? 'Final' : '');

  // Sorted events by minute
  const events = [...(match.events || [])].sort((a, b) => (a.minute || 0) - (b.minute || 0));
  const potmEvent = events.find((e) => e.type === 'potm');
  const matchEvents = events.filter((e) => e.type !== 'potm');

  const lineupPlayers = (match.lineup || [])
    .map((pid) => playersMap[pid])
    .filter(Boolean);

  const team1Lineup = lineupPlayers.filter((p) => p.team_id === match.team1_id);
  const team2Lineup = lineupPlayers.filter((p) => p.team_id === match.team2_id);

  const getTeamLogo = (name, logoUrl) =>
    logoUrl || (name && name !== 'TBD' ? `/assets/teams/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.png` : null);

  const isKnockout = match.stage === 'semi' || match.stage === 'final';
  const isDrawn = isPlayed && match.score1 !== null && match.score2 !== null && match.score1 === match.score2;
  const team1Goals = events.filter((e) => e.type === 'goal' && e.team_id === match.team1_id);
  const team2Goals = events.filter((e) => e.type === 'goal' && e.team_id === match.team2_id);
  const winnerName = match.winner_id
    ? (match.winner_id === match.team1_id ? match.team1_name : match.team2_name)
    : null;

  return (
    <div>
      <button
        onClick={() => navigate('/matches')}
        className="btn btn-outline btn-sm"
        style={{ marginBottom: '18px' }}
      >
        <ArrowLeft size={13} /> Back to Matches
      </button>

      {/* Main Match Header Card */}
      <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--chalk-dim)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Match #{match.match_number} {label ? `· ${label}` : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <StatusPill status={match.status} isHalfTime={Boolean(match.is_half_time)} />
            {isAdmin && (
              <NavLink
                to={`/admin/matches/${match.id}/live`}
                className="btn btn-sm btn-primary"
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                <Settings size={12} /> Live Control
              </NavLink>
            )}
          </div>
        </div>

        {/* Score & Teams Display */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', margin: '20px 0' }}>
          {/* Team 1 */}
          <div
            onClick={() => match.team1_id && navigate(`/teams/${match.team1_id}`)}
            style={{ textAlign: 'center', flex: 1, cursor: match.team1_id ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <Avatar name={match.team1_name || 'TBD'} photoUrl={getTeamLogo(match.team1_name, match.team1_logo)} size={56} color="#f0a53d" />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700 }}>
              {match.team1_name || 'TBD'}
            </div>
            {match.winner_id === match.team1_id && (
              <span className="pill pill-full-time" style={{ marginTop: '6px', fontSize: '10px' }}>
                Winner
              </span>
            )}
          </div>

          {/* Big Score Header */}
          <div style={{ textAlign: 'center', padding: '0 24px' }}>
            {isPlayed ? (
              <div className="hero-score" style={{ fontSize: '48px', letterSpacing: '2px', lineHeight: 1 }}>
                {match.score1 ?? 0} &ndash; {match.score2 ?? 0}
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--chalk-dim)' }}>
                VS
              </div>
            )}
            <div style={{ fontSize: '12px', color: match.is_half_time ? 'var(--amber)' : 'var(--chalk-muted)', marginTop: '8px', fontWeight: match.is_half_time ? 700 : 500 }}>
              {match.status === 'live' ? (match.is_half_time ? 'HALF TIME' : 'MATCH IN PROGRESS') : match.status === 'full_time' ? 'FULL TIME' : 'UPCOMING'}
            </div>
          </div>

          {/* Team 2 */}
          <div
            onClick={() => match.team2_id && navigate(`/teams/${match.team2_id}`)}
            style={{ textAlign: 'center', flex: 1, cursor: match.team2_id ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <Avatar name={match.team2_name || 'TBD'} photoUrl={getTeamLogo(match.team2_name, match.team2_logo)} size={56} color="#3ecf6e" />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700 }}>
              {match.team2_name || 'TBD'}
            </div>
            {match.winner_id === match.team2_id && (
              <span className="pill pill-full-time" style={{ marginTop: '6px', fontSize: '10px' }}>
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
              margin: '16px auto 20px',
              padding: '12px 28px',
              background: 'var(--panel-alt)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              maxWidth: '340px',
              width: '100%',
              textAlign: 'center',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Clock
                size={15}
                color={
                  match.status === 'live'
                    ? match.is_half_time
                      ? 'var(--amber)'
                      : 'var(--green)'
                    : 'var(--amber)'
                }
              />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: 'var(--chalk-dim)',
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
                    background: 'var(--green)',
                    display: 'inline-block',
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
                    background: 'var(--amber)',
                    display: 'inline-block',
                  }}
                  title="Paused for Half Time"
                />
              )}
            </div>

            <div
              data-testid="timer-display"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '38px',
                fontWeight: 700,
                letterSpacing: '2px',
                lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums',
                color:
                  match.status === 'live'
                    ? match.is_half_time
                      ? 'var(--amber)'
                      : 'var(--green)'
                    : match.status === 'full_time'
                    ? 'var(--amber)'
                    : 'var(--chalk)',
              }}
            >
              {timerUnknown ? '—' : formatTime(timerSeconds)}
            </div>

            <div
              data-testid="timer-status"
              style={{
                fontSize: '11.5px',
                fontWeight: 600,
                color:
                  match.status === 'live'
                    ? match.is_half_time
                      ? 'var(--amber)'
                      : 'var(--green)'
                    : match.status === 'full_time'
                    ? 'var(--amber)'
                    : 'var(--chalk-muted)',
                marginTop: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
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
              padding: '12px 18px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              marginBottom: '16px',
              fontSize: '12.5px',
            }}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
              {team1Goals.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px' }}>⚽</span>
                  <span style={{ fontWeight: 600 }}>{g.player_name}</span>
                  {g.minute && <span style={{ color: 'var(--amber)', fontSize: '11.5px', fontWeight: 600 }}>{g.minute}'</span>}
                  {g.assist_player_name && (
                    <span style={{ color: 'var(--chalk-muted)', fontSize: '11px' }}>({g.assist_player_name})</span>
                  )}
                </div>
              ))}
            </div>
            <div className="goal-scorer-panel-team2" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right', alignItems: 'flex-end' }}>
              {team2Goals.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {g.assist_player_name && (
                    <span style={{ color: 'var(--chalk-muted)', fontSize: '11px' }}>({g.assist_player_name})</span>
                  )}
                  {g.minute && <span style={{ color: '#3ecf6e', fontSize: '11.5px', fontWeight: 600 }}>{g.minute}'</span>}
                  <span style={{ fontWeight: 600 }}>{g.player_name}</span>
                  <span style={{ fontSize: '13px' }}>⚽</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tied Knockout Match Note */}
        {isKnockout && isDrawn && (
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(240, 165, 61, 0.08)',
              border: '1px solid rgba(240, 165, 61, 0.3)',
              borderRadius: '6px',
              marginBottom: '16px',
              textAlign: 'center',
              fontSize: '13px',
              color: 'var(--amber)',
            }}
          >
            {winnerName ? (
              <span>
                <strong>Tied at full time</strong> &mdash; Winner set by admin: <strong>{winnerName}</strong>
              </span>
            ) : (
              <span>
                <strong>Tied at full time</strong> &mdash; Winner set by admin (waiting for admin to set winner)
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
            borderTop: '1px solid var(--line)',
            paddingTop: '14px',
            fontSize: '13px',
            color: 'var(--chalk-dim)',
            flexWrap: 'wrap',
          }}
        >
          {match.date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} color="var(--amber)" /> {match.date}
            </span>
          )}
          {match.time && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="var(--amber)" /> {match.time}
            </span>
          )}
          {match.venue && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={14} color="var(--amber)" /> {match.venue}
            </span>
          )}
        </div>
      </div>

      {/* Player of the Match banner if awarded */}
      {potmEvent && (
        <div
          className="card"
          style={{
            marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(240, 165, 61, 0.12), var(--panel))',
            borderColor: 'rgba(240, 165, 61, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--amber)', color: 'var(--base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Award size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Player of the Match
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700 }}>{potmEvent.player_name}</div>
          </div>
        </div>
      )}

      {/* Match Events Timeline & Lineups Grid */}
      <div className="grid-2">
        {/* Events Timeline */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            Match Events
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
                      justifyContent: isTeam1 ? 'flex-start' : 'flex-end',
                      borderLeft: isTeam1 ? '3px solid #f0a53d' : '1px solid var(--line)',
                      borderRight: !isTeam1 ? '3px solid #3ecf6e' : '1px solid var(--line)',
                    }}
                  >
                    <div className="event-minute">{evt.minute ? `${evt.minute}'` : '•'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>
                        {evt.type === 'goal' ? '⚽' : evt.type === 'yellow' ? '🟨' : evt.type === 'red' ? '🟥' : '•'}
                      </span>
                      <div>
                        <span style={{ fontWeight: 600 }}>{evt.player_name}</span>
                        {evt.assist_player_name && (
                          <span style={{ fontSize: '12px', color: 'var(--chalk-dim)', marginLeft: '6px' }}>
                            (assist: {evt.assist_player_name})
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--chalk-muted)', marginLeft: '8px', textTransform: 'capitalize' }}>
                          {evt.type}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--chalk-muted)', fontSize: '13.5px', textAlign: 'center', padding: '24px' }}>
              {isPlayed ? 'No timeline events recorded for this match.' : 'Events will appear here once the match starts.'}
            </p>
          )}
        </div>

        {/* Team Lineups */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            Match Lineups
          </h3>

          {lineupPlayers.length > 0 ? (
            <div className="grid-2" style={{ gap: '16px' }}>
              {/* Team 1 squad */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', color: 'var(--amber)' }}>
                  {match.team1_name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {team1Lineup.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--chalk-dim)', width: '18px' }}>
                        #{p.number}
                      </span>
                      <span>{p.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--chalk-muted)', marginLeft: 'auto' }}>
                        {p.position}
                      </span>
                    </div>
                  ))}
                  {team1Lineup.length === 0 && <span style={{ fontSize: '12px', color: 'var(--chalk-muted)' }}>None recorded</span>}
                </div>
              </div>

              {/* Team 2 squad */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', color: 'var(--green)' }}>
                  {match.team2_name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {team2Lineup.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--chalk-dim)', width: '18px' }}>
                        #{p.number}
                      </span>
                      <span>{p.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--chalk-muted)', marginLeft: 'auto' }}>
                        {p.position}
                      </span>
                    </div>
                  ))}
                  {team2Lineup.length === 0 && <span style={{ fontSize: '12px', color: 'var(--chalk-muted)' }}>None recorded</span>}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--chalk-muted)', fontSize: '13.5px', textAlign: 'center', padding: '24px' }}>
              No lineup information submitted for this match.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
