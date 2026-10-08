import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { matchesApi } from '../../api/matches';
import { playersApi } from '../../api/players';
import { StatusPill } from '../../components/common/StatusPill';
import { Avatar } from '../../components/common/Avatar';
import { LoadingState, ErrorState } from '../../components/common/Common';
import { useLiveSocket } from '../../hooks/useLiveSocket';
import { formatTime } from '../../utils/time';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Zap,
  Clock,
} from 'lucide-react';

export function AdminLiveControlPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // The error banner renders at the top of the page; bring it into view when an
  // action fails while the operator is scrolled down at the event/lineup forms.
  useEffect(() => {
    if (error) window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [error]);

  // New Event Form State
  const [eventType, setEventType] = useState('goal');
  const [eventTeamId, setEventTeamId] = useState('');
  const [eventPlayerId, setEventPlayerId] = useState('');
  const [eventAssistId, setEventAssistId] = useState('');
  const [eventMinute, setEventMinute] = useState('');

  // Lineup management state
  const [selectedLineup, setSelectedLineup] = useState([]);

  // Match Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  // True only for a full_time match with no recorded duration anywhere
  // (no started_at/ended_at pair, no saved local timer state) — distinguishes
  // "duration genuinely wasn't recorded" from "the match lasted 0 seconds"
  // (audit finding L-4).
  const [timerUnknown, setTimerUnknown] = useState(false);
  const [isHalfTime, setIsHalfTime] = useState(false);
  const currentSecondsRef = useRef(0);
  currentSecondsRef.current = timerSeconds;

  useEffect(() => {
    setTimerSeconds(0);
    const timerStorageKey = `dcl_timer_${matchId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(timerStorageKey) || 'null');
      if (saved && saved.isPaused) {
        setIsHalfTime(true);
        setTimerSeconds(saved.elapsed || 0);
      } else {
        setIsHalfTime(false);
      }
    } catch {
      setIsHalfTime(false);
    }
    loadMatchDetails();
  }, [matchId]);

  // Live Match Timer Synchronization
  useEffect(() => {
    if (!match) return;

    const timerStorageKey = `dcl_timer_${match.id}`;

    // Starting a new match or upcoming/cancelled match: reset timer to 00:00
    if (match.status === 'upcoming' || match.status === 'cancelled') {
      setTimerSeconds(0);
      setTimerUnknown(false);
      setIsHalfTime(false);
      try {
        localStorage.removeItem(timerStorageKey);
      } catch {
        // ignore storage errors
      }
      return;
    }

    // When the match stops, stop at current time
    if (match.status === 'full_time') {
      setIsHalfTime(false);
      let finalSec = null;
      if (match.started_at && match.ended_at) {
        finalSec = Math.max(
          0,
          Math.floor((new Date(match.ended_at).getTime() - new Date(match.started_at).getTime()) / 1000)
        );
      } else {
        try {
          const saved = JSON.parse(localStorage.getItem(timerStorageKey) || '{}');
          if (typeof saved.elapsed === 'number') {
            finalSec = saved.elapsed;
          } else if (saved.startedAt) {
            finalSec = (saved.elapsedBefore || 0) + Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000));
          }
        } catch {
          // fallback
        }
        if (finalSec === null && currentSecondsRef.current) {
          finalSec = currentSecondsRef.current;
        }
      }
      const unknown = finalSec === null;
      setTimerUnknown(unknown);
      setTimerSeconds(unknown ? 0 : finalSec);
      try {
        localStorage.setItem(timerStorageKey, JSON.stringify({ elapsed: unknown ? 0 : finalSec, isRunning: false }));
      } catch {
        // ignore
      }
      return;
    }

    setTimerUnknown(false);

    // When the match starts/is live, count upward from 00:00 or hold if paused at Half Time
    if (match.status === 'live') {
      let savedData = null;
      try {
        savedData = JSON.parse(localStorage.getItem(timerStorageKey) || 'null');
      } catch {
        savedData = null;
      }

      if (savedData && savedData.isPaused) {
        setIsHalfTime(true);
        setTimerSeconds(savedData.elapsed || 0);
        return;
      }

      if (isHalfTime) {
        return;
      }

      const getElapsed = () => {
        let currentSaved = null;
        try {
          currentSaved = JSON.parse(localStorage.getItem(timerStorageKey) || 'null');
        } catch {
          currentSaved = null;
        }

        if (currentSaved && currentSaved.isPaused) {
          return currentSaved.elapsed || 0;
        }

        if (currentSaved && currentSaved.startedAt) {
          const baseMs = currentSaved.startedAt;
          const elapsedBefore = currentSaved.elapsedBefore || 0;
          return elapsedBefore + Math.max(0, Math.floor((Date.now() - baseMs) / 1000));
        }

        if (match.started_at) {
          const startMs = new Date(match.started_at).getTime();
          return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        }

        const now = Date.now();
        const initial = { startedAt: now, elapsedBefore: 0, isRunning: true, isPaused: false };
        try {
          localStorage.setItem(timerStorageKey, JSON.stringify(initial));
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
  }, [match?.id, match?.status, match?.started_at, match?.ended_at, isHalfTime]);

  const loadMatchDetails = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await matchesApi.getMatch(matchId);
      setMatch(data);
      if (data.is_half_time) {
        setIsHalfTime(true);
        if (typeof data.elapsed_seconds === 'number') {
          setTimerSeconds(data.elapsed_seconds);
        }
      } else if (data.status === 'live') {
        setIsHalfTime(false);
      }
      setSelectedLineup(data.lineup || []);

      if (data.team1_id) {
        setEventTeamId(data.team1_id);
        const p1 = await playersApi.getPlayers({ team_id: data.team1_id });
        setTeam1Players(p1 || []);
      }
      if (data.team2_id) {
        const p2 = await playersApi.getPlayers({ team_id: data.team2_id });
        setTeam2Players(p2 || []);
      }
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load match details');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useLiveSocket((msg) => {
    if (!msg.match_id || msg.match_id === matchId) {
      loadMatchDetails(false);
    }
  });

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleStart = async () => {
    try {
      setActionLoading(true);
      // Reset timer to 00:00 on match start
      setTimerSeconds(0);
      setIsHalfTime(false);
      try {
        localStorage.setItem(`dcl_timer_${matchId}`, JSON.stringify({ startedAt: Date.now(), elapsedBefore: 0, isRunning: true, isPaused: false }));
      } catch {
        // ignore
      }
      await matchesApi.startMatch(matchId);
      showSuccess('Match started and LIVE!');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnd = async () => {
    try {
      setActionLoading(true);
      setIsHalfTime(false);
      // Stop timer at current time
      const stoppedSeconds = currentSecondsRef.current;
      setTimerSeconds(stoppedSeconds);
      try {
        localStorage.setItem(`dcl_timer_${matchId}`, JSON.stringify({ elapsed: stoppedSeconds, isRunning: false, isPaused: false }));
      } catch {
        // ignore
      }
      await matchesApi.endMatch(matchId);
      showSuccess('Match ended! Final score and standings saved.');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // handleHalfTime/handleResume/handleResetTimer previously updated local
  // timer state and localStorage BEFORE calling the API, then silently
  // swallowed any error from the call itself (`catch { /* ignore */ }`).
  // That meant a failed request (expired token, network blip, a 409 from a
  // race with another action) still showed "Match paused for Half Time" as
  // if it had succeeded — the admin's own screen and the actual server
  // state (and everyone else's view, via the WebSocket broadcast that
  // never fired) could silently disagree. Found during the Timer/Half-Time
  // audit; fixed by calling the API first and only updating local state —
  // and showing an error — based on what the server actually did, matching
  // every other handler in this file (handleStart/handleEnd/handleReopen).
  const handleHalfTime = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const currentSec = currentSecondsRef.current || 0;
      await matchesApi.pauseHalfTime(matchId, { elapsed_seconds: currentSec });
      showSuccess('Match paused for Half Time');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message || 'Failed to pause for half time');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await matchesApi.resumeMatch(matchId);
      showSuccess('Match resumed from Half Time');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message || 'Failed to resume the match');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    try {
      setActionLoading(true);
      setIsHalfTime(false);
      const currentSec = currentSecondsRef.current;
      try {
        localStorage.setItem(`dcl_timer_${matchId}`, JSON.stringify({ startedAt: Date.now(), elapsedBefore: currentSec, isRunning: true, isPaused: false }));
      } catch {
        // ignore
      }
      await matchesApi.reopenMatch(matchId);
      showSuccess('Match reopened to LIVE');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetTimer = async () => {
    if (match?.status !== 'live') {
      try {
        localStorage.removeItem(`dcl_timer_${matchId}`);
      } catch {
        // ignore — purely a stale-cache cleanup, not app state
      }
      setTimerSeconds(0);
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      await matchesApi.resetTimer(matchId);
      await loadMatchDetails();
    } catch (err) {
      setError(err.message || 'Failed to reset the timer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!eventTeamId || !eventPlayerId) {
      setError('Please select a team and player');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);

      const payload = {
        type: eventType,
        team_id: eventTeamId,
        player_id: eventPlayerId,
        minute: eventMinute ? parseInt(eventMinute, 10) : undefined,
        assist_player_id: eventType === 'goal' && eventAssistId ? eventAssistId : undefined,
      };

      await matchesApi.addEvent(matchId, payload);
      showSuccess(`Recorded ${eventType.toUpperCase()} event!`);
      setEventMinute('');
      setEventAssistId('');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message || 'Failed to add event');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Delete this event? (Scores and stats will be adjusted)')) return;
    try {
      setActionLoading(true);
      await matchesApi.deleteEvent(matchId, eventId);
      showSuccess('Event deleted');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message || 'Failed to delete event');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleLineupPlayer = (playerId) => {
    if (selectedLineup.includes(playerId)) {
      setSelectedLineup(selectedLineup.filter((id) => id !== playerId));
    } else {
      setSelectedLineup([...selectedLineup, playerId]);
    }
  };

  const handleSaveLineup = async () => {
    try {
      setActionLoading(true);
      await matchesApi.updateLineup(matchId, selectedLineup);
      showSuccess('Lineups updated successfully!');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message || 'Failed to save lineup');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWinnerOverride = async (winnerId) => {
    try {
      setActionLoading(true);
      await matchesApi.setWinner(matchId, winnerId);
      showSuccess('Winner override updated');
      await loadMatchDetails();
    } catch (err) {
      setError(err.message || 'Failed to set winner');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState message="Connecting to Live Match Control..." />;
  if (error && !match) return <ErrorState message={error} onRetry={loadMatchDetails} />;

  const activeTeamPlayers = eventTeamId === match.team1_id ? team1Players : team2Players;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button onClick={() => navigate('/admin')} className="btn btn-outline btn-sm">
          <ArrowLeft size={13} /> Back to Dashboard
        </button>
        <span style={{ fontSize: '12px', color: 'var(--chalk-dim)', fontWeight: 600 }}>
          LIVE CONTROL CONSOLE
        </span>
      </div>

      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '6px', background: 'rgba(62, 207, 110, 0.15)', border: '1px solid var(--green)', color: 'var(--green)', fontSize: '13px', marginBottom: '16px' }}>
          <CheckCircle size={16} /> <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '6px', background: 'rgba(209, 88, 90, 0.15)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: '13px', marginBottom: '16px' }}>
          <AlertTriangle size={16} /> <span>{error}</span>
        </div>
      )}

      {/* Match Control Header */}
      <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '12px', color: 'var(--chalk-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Match #{match.match_number} · {match.label || `Stage: ${match.stage}`}
          </span>
          <StatusPill status={match.status} isHalfTime={isHalfTime} />
        </div>

        {/* Live Score Display */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', margin: '14px 0' }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <Avatar name={match.team1_name || 'TBD'} size={52} color="#f0a53d" />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, marginTop: '8px' }}>
              {match.team1_name || 'TBD'}
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: '0 20px' }}>
            <div className="hero-score" style={{ fontSize: '46px', letterSpacing: '2px' }}>
              {match.score1 ?? 0} &ndash; {match.score2 ?? 0}
            </div>
          </div>

          <div style={{ textAlign: 'center', flex: 1 }}>
            <Avatar name={match.team2_name || 'TBD'} size={52} color="#3ecf6e" />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, marginTop: '8px' }}>
              {match.team2_name || 'TBD'}
            </div>
          </div>
        </div>

        {/* Match Timer Display */}
        <div
          className="admin-timer-card"
          data-testid="match-timer"
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
            <Clock size={15} color={match.status === 'live' ? (isHalfTime ? 'var(--amber)' : 'var(--green)') : 'var(--amber)'} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--chalk-dim)' }}>
              Match Timer
            </span>
            {match.status === 'live' && !isHalfTime && (
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
            {match.status === 'live' && isHalfTime && (
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
              color: match.status === 'live' ? (isHalfTime ? 'var(--amber)' : 'var(--green)') : match.status === 'full_time' ? 'var(--amber)' : 'var(--chalk)',
            }}
          >
            {timerUnknown ? '—' : formatTime(timerSeconds)}
          </div>

          <div
            data-testid="timer-status"
            style={{
              fontSize: '11.5px',
              fontWeight: 600,
              color: match.status === 'live' ? (isHalfTime ? 'var(--amber)' : 'var(--green)') : match.status === 'full_time' ? 'var(--amber)' : 'var(--chalk-muted)',
              marginTop: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {match.status === 'live'
              ? isHalfTime
                ? 'Half Time • Timer Paused'
                : 'Live • Timer Running'
              : match.status === 'full_time'
              ? 'Full Time • Timer Stopped'
              : match.status === 'cancelled'
              ? 'Match Cancelled'
              : 'Match Not Started'}
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleResetTimer}
            title="Reset timer to 00:00"
            style={{ fontSize: '11px', padding: '3px 8px', marginTop: '6px', height: '24px', color: 'var(--chalk-dim)' }}
          >
            <RotateCcw size={11} /> Reset to 00:00
          </button>
        </div>

        {/* Status Transition Control Bar */}
        <div
          className="admin-status-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          {match.status === 'upcoming' && (
            <button className="btn btn-success" onClick={handleStart} disabled={actionLoading}>
              <Play size={14} /> Start Match (Kick Off)
            </button>
          )}

          {match.status === 'live' && (
            <>
              {!isHalfTime ? (
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={handleHalfTime}
                  disabled={actionLoading}
                >
                  <Pause size={14} /> Half Time
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleResume}
                  disabled={actionLoading}
                >
                  <Play size={14} /> Resume
                </button>
              )}
              <button className="btn btn-primary" onClick={handleEnd} disabled={actionLoading}>
                <Square size={14} /> End Match (Full Time)
              </button>
            </>
          )}

          {match.status === 'full_time' && (
            <button className="btn btn-outline" onClick={handleReopen} disabled={actionLoading}>
              <RotateCcw size={14} /> Reopen Match to LIVE
            </button>
          )}

          {/* Knockout Winner Override if drawn */}
          {match.stage !== 'group' && match.status === 'full_time' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--chalk-dim)' }}>Winner:</span>
              <button
                className={`btn btn-sm ${match.winner_id === match.team1_id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleWinnerOverride(match.team1_id)}
                disabled={actionLoading}
              >
                {match.team1_name}
              </button>
              <button
                className={`btn btn-sm ${match.winner_id === match.team2_id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleWinnerOverride(match.team2_id)}
                disabled={actionLoading}
              >
                {match.team2_name}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Event Logger & Current Events */}
      <div className="grid-2" style={{ marginBottom: '28px' }}>
        {/* Event Form */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} color="var(--amber)" /> Log Match Event
          </h3>

          <form onSubmit={handleAddEvent}>
            {/* Event Type */}
            <div className="field">
              <label>Event Type</label>
              <div className="admin-event-type-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {[
                  { id: 'goal', label: '⚽ Goal' },
                  { id: 'yellow', label: '🟨 Yellow' },
                  { id: 'red', label: '🟥 Red' },
                  { id: 'potm', label: '⭐ POTM' },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    className={`btn btn-sm ${eventType === type.id ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setEventType(type.id)}
                    style={{ fontSize: '12px', padding: '6px 4px' }}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Team Selector */}
            <div className="field">
              <label>Team</label>
              <div className="admin-event-team-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${eventTeamId === match.team1_id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => {
                    setEventTeamId(match.team1_id);
                    setEventPlayerId('');
                    setEventAssistId('');
                  }}
                >
                  {match.team1_name}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${eventTeamId === match.team2_id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => {
                    setEventTeamId(match.team2_id);
                    setEventPlayerId('');
                    setEventAssistId('');
                  }}
                >
                  {match.team2_name}
                </button>
              </div>
            </div>

            {/* Player Selector */}
            <div className="field">
              <label htmlFor="event-player">Player</label>
              <select
                id="event-player"
                className="select"
                value={eventPlayerId}
                onChange={(e) => setEventPlayerId(e.target.value)}
                required
              >
                <option value="">Select Player...</option>
                {activeTeamPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} {p.name} ({p.position})
                  </option>
                ))}
              </select>
            </div>

            {/* Assist Selector (only for goals) */}
            {eventType === 'goal' && (
              <div className="field">
                <label htmlFor="event-assist">Assist (Optional)</label>
                <select
                  id="event-assist"
                  className="select"
                  value={eventAssistId}
                  onChange={(e) => setEventAssistId(e.target.value)}
                >
                  <option value="">None / Unassisted</option>
                  {activeTeamPlayers
                    .filter((p) => p.id !== eventPlayerId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.number} {p.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Minute (not needed for POTM) */}
            {eventType !== 'potm' && (
              <div className="field">
                <label htmlFor="event-minute">Match Minute (1 - 120, required)</label>
                <input
                  id="event-minute"
                  type="number"
                  min="1"
                  max="120"
                  required
                  className="input"
                  placeholder="e.g. 34"
                  value={eventMinute}
                  onChange={(e) => setEventMinute(e.target.value)}
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={actionLoading}>
              <Plus size={15} /> Submit Event
            </button>
          </form>
        </div>

        {/* Current Events List */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            Recorded Match Events ({match.events?.length || 0})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {(match.events || []).map((evt) => (
              <div
                key={evt.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'var(--panel-alt)',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px' }}>
                    {evt.type === 'goal' ? '⚽' : evt.type === 'yellow' ? '🟨' : evt.type === 'red' ? '🟥' : '⭐'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                      {evt.player_name}
                      {evt.minute ? ` (${evt.minute}')` : ''}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>
                      {evt.type.toUpperCase()}
                      {evt.assist_player_name ? ` · Assist: ${evt.assist_player_name}` : ''}
                    </div>
                  </div>
                </div>

                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDeleteEvent(evt.id)}
                  disabled={actionLoading}
                  title="Remove this event"
                  style={{ padding: '4px 8px' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {(!match.events || match.events.length === 0) && (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--chalk-muted)' }}>
                No events recorded for this match yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Match Lineup Submissions */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600 }}>
              Match Lineups ({selectedLineup.length} Selected)
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--chalk-dim)' }}>
              Select all players who took the pitch in this match to track their appearances.
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSaveLineup} disabled={actionLoading}>
            Save Lineups
          </button>
        </div>

        <div className="grid-2">
          {/* Team 1 squad */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', color: 'var(--amber)' }}>
              {match.team1_name} Squad
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflowY: 'auto' }}>
              {team1Players.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    background: selectedLineup.includes(p.id) ? 'rgba(240, 165, 61, 0.12)' : 'var(--panel-alt)',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedLineup.includes(p.id)}
                    onChange={() => handleToggleLineupPlayer(p.id)}
                  />
                  <span>#{p.number} {p.name} ({p.position})</span>
                </label>
              ))}
            </div>
          </div>

          {/* Team 2 squad */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', color: 'var(--green)' }}>
              {match.team2_name} Squad
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflowY: 'auto' }}>
              {team2Players.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    background: selectedLineup.includes(p.id) ? 'rgba(62, 207, 110, 0.12)' : 'var(--panel-alt)',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedLineup.includes(p.id)}
                    onChange={() => handleToggleLineupPlayer(p.id)}
                  />
                  <span>#{p.number} {p.name} ({p.position})</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
