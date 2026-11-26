import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { matchesApi } from '../../api/matches';
import { playersApi } from '../../api/players';
import { authApi } from '../../api/auth';
import { StatusPill } from '../../components/common/StatusPill';
import { Avatar } from '../../components/common/Avatar';
import { LoadingState, ErrorState } from '../../components/common/Common';
import { useLiveSocket } from '../../hooks/useLiveSocket';
import { formatTime } from '../../utils/time';
import { clockOffsetMs, matchElapsedSeconds } from '../../utils/clock';
import { EventIcon } from '../../components/common/EventIcon';
import { Scoreboard } from '../../components/match/Scoreboard';
import { ScoreLine } from '../../components/common/ScoreLine';
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
  // The minute follows the match clock until the operator types their own
  const [minuteTouched, setMinuteTouched] = useState(false);
  const boardRef = useRef(null);
  const [boardVisible, setBoardVisible] = useState(true);

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

  const clockOffsetRef = useRef(0);

  useEffect(() => {
    setTimerSeconds(0);
    setIsHalfTime(false);
    loadMatchDetails();
  }, [matchId]);

  // Match clock: derived only from server fields and the server's own "now" (see utils/clock.js),
  // so every device agrees whatever its local clock or storage says.
  useEffect(() => {
    if (!match) return undefined;
    const compute = () => matchElapsedSeconds(match, clockOffsetRef.current);
    const initial = compute();
    setTimerUnknown(initial === null);
    setTimerSeconds(initial ?? 0);
    setIsHalfTime(Boolean(match.is_half_time) && match.status === 'live');
    if (match.status === 'live' && !match.is_half_time) {
      const interval = setInterval(() => setTimerSeconds(compute() ?? 0), 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [match]);

  const clockMinute =
    match?.status === 'live'
      ? isHalfTime
        ? Math.max(1, Math.ceil(timerSeconds / 60))
        : Math.floor(timerSeconds / 60) + 1
      : null;

  useEffect(() => {
    if (!minuteTouched && clockMinute) setEventMinute(String(clockMinute));
  }, [clockMinute, minuteTouched]);

  // Keep the score and clock in view: when the full scoreboard scrolls away, a compact strip takes over.
  const hasMatch = Boolean(match);
  useEffect(() => {
    if (!hasMatch || !boardRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setBoardVisible(entry.isIntersecting), {
      rootMargin: '-60px 0px 0px 0px',
    });
    observer.observe(boardRef.current);
    return () => observer.disconnect();
  }, [hasMatch]);

  const loadMatchDetails = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await matchesApi.getMatch(matchId);
      clockOffsetRef.current = clockOffsetMs(data, Date.now());
      setMatch(data);
      // Only seed the form on the first load: a live refresh must not undo a team the operator has
      // picked or a lineup they are in the middle of editing.
      if (showLoading) setSelectedLineup(data.lineup || []);

      if (data.team1_id) {
        setEventTeamId((current) => current || data.team1_id);
        const p1 = await playersApi.getPlayers({ team_id: data.team1_id, tournament_id: data.tournament_id });
        setTeam1Players((p1 || []).filter((p) => !p.is_manager)); // managers do not play
      }
      if (data.team2_id) {
        const p2 = await playersApi.getPlayers({ team_id: data.team2_id, tournament_id: data.tournament_id });
        setTeam2Players((p2 || []).filter((p) => !p.is_manager));
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
  }, match?.tournament_id);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleStart = async () => {
    try {
      setActionLoading(true);
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
      // The server freezes the clock from its own started_at; the client never supplies the minute.
      await matchesApi.pauseHalfTime(matchId);
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
      return; // nothing to reset: the clock is read-only outside a live match
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
        minute: eventType !== 'potm' && eventMinute ? parseInt(eventMinute, 10) : undefined,
        assist_player_id: eventType === 'goal' && eventAssistId ? eventAssistId : undefined,
      };

      await matchesApi.addEvent(matchId, payload);
      showSuccess(`Recorded ${eventType.toUpperCase()} event!`);
      setEventMinute('');
      setMinuteTouched(false);
      setEventAssistId('');
      setEventPlayerId('');
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
  const live = match.status === 'live';
  const clockState = live ? (isHalfTime ? 'ht' : 'live') : match.status === 'full_time' ? 'ft' : 'idle';
  const clockText = live
    ? isHalfTime
      ? 'Half Time • Timer Paused'
      : 'Live • Timer Running'
    : match.status === 'full_time'
    ? 'Full Time • Timer Stopped'
    : match.status === 'cancelled'
    ? 'Match Cancelled'
    : 'Match Not Started';
  const eventTypes = [
    { id: 'goal', label: 'Goal' },
    { id: 'yellow', label: 'Yellow' },
    { id: 'red', label: 'Red' },
    { id: 'potm', label: 'POTM' },
  ];
  const teamSides = [
    { id: match.team1_id, name: match.team1_name, color: match.team1_color },
    { id: match.team2_id, name: match.team2_name, color: match.team2_color },
  ];
  const pickTeam = (teamId) => {
    setEventTeamId(teamId);
    setEventPlayerId('');
    setEventAssistId('');
  };
  const assistOptions = activeTeamPlayers.filter((p) => p.id !== eventPlayerId);

  const clockBlock = (
    <div className={`sb-clock sb-clock--${clockState}`} data-testid="match-timer">
      <span className="sb-clock__row">
        <Clock size={15} aria-hidden="true" />
        <span data-testid="timer-display" className="timer-display num sb-clock__time sb-clock__time--console">
          {timerUnknown ? '—' : formatTime(timerSeconds)}
        </span>
        {live && !isHalfTime && <span className="live-dot" data-testid="timer-live-dot" />}
        {live && isHalfTime && <span className="sb-dot-ht" data-testid="timer-halftime-dot" title="Paused for Half Time" />}
      </span>
      <span data-testid="timer-status" className="sb-clock__state">{clockText}</span>
      <button
        type="button"
        className="btn btn-outline btn-sm cockpit-reset"
        onClick={handleResetTimer}
        title="Reset timer to 00:00"
        disabled={!live || actionLoading}
      >
        <RotateCcw size={12} aria-hidden="true" /> Reset to 00:00
      </button>
    </div>
  );

  return (
    <div className="cockpit">
      <div className="cockpit__bar">
        <button onClick={() => navigate(authApi.isScorer() ? '/scorer' : '/organizer')} className="btn btn-outline btn-sm">
          <ArrowLeft size={13} aria-hidden="true" /> Back to Dashboard
        </button>
        <span className="cockpit__title">Live control console</span>
      </div>

      {/* Sticky strip: appears once the full scoreboard has scrolled out of view */}
      {!boardVisible && (
        <div className={`cockpit-strip cockpit-strip--${clockState}`} aria-label="Score and clock">
          <span className="cockpit-strip__team" style={{ '--team-color': match.team1_color || '#64748B' }}>{match.team1_name}</span>
          <ScoreLine home={match.score1} away={match.score2} size="md" />
          <span className="cockpit-strip__team cockpit-strip__team--away" style={{ '--team-color': match.team2_color || '#64748B' }}>{match.team2_name}</span>
          <span className="cockpit-strip__clock num">{timerUnknown ? '—' : formatTime(timerSeconds)}</span>
        </div>
      )}

      {successMsg && (
        <div className="cockpit-banner cockpit-banner--ok" role="status">
          <CheckCircle size={16} aria-hidden="true" /> <span>{successMsg}</span>
        </div>
      )}
      {error && (() => {
        const lower = error.toLowerCase();
        const isForbidden = ['not assigned', 'not own', 'forbidden', 'unauthorized', 'permission', '403'].some((k) => lower.includes(k));
        return (
          <div
            role="alert"
            data-testid={isForbidden ? 'access-denied-banner' : 'live-control-error'}
            className={`cockpit-banner cockpit-banner--err ${isForbidden ? 'is-forbidden' : ''}`}
          >
            <AlertTriangle size={isForbidden ? 20 : 16} aria-hidden="true" />
            <span>{isForbidden && !lower.includes('access denied') ? `Access Denied: ${error}` : error}</span>
          </div>
        );
      })()}

      {/* Scoreboard and clock controls */}
      <section className="card cockpit-board" ref={boardRef}>
        <div className="cockpit-board__head">
          <span className="match-title">
            <span className="match-title__no">Match #{match.match_number}</span>
            <span className="match-title__stage">{match.label || `Stage: ${match.stage}`}</span>
          </span>
          <StatusPill status={match.status} isHalfTime={isHalfTime} />
        </div>

        <Scoreboard match={match} variant="console" center={clockBlock} />

        <div className="cockpit-controls admin-status-bar">
          {match.status === 'upcoming' && (
            <button className="cockpit-btn cockpit-btn--go" onClick={handleStart} disabled={actionLoading}>
              <Play size={18} aria-hidden="true" /> Start Match (Kick Off)
            </button>
          )}
          {live && (
            <>
              {!isHalfTime ? (
                <button type="button" className="cockpit-btn cockpit-btn--pause" onClick={handleHalfTime} disabled={actionLoading}>
                  <Pause size={18} aria-hidden="true" /> Half Time
                </button>
              ) : (
                <button type="button" className="cockpit-btn cockpit-btn--go" onClick={handleResume} disabled={actionLoading}>
                  <Play size={18} aria-hidden="true" /> Resume
                </button>
              )}
              <button className="cockpit-btn cockpit-btn--end" onClick={handleEnd} disabled={actionLoading}>
                <Square size={18} aria-hidden="true" /> End Match (Full Time)
              </button>
            </>
          )}
          {/* Reopen and winner override are tournament-owner actions; scorers only run the live clock/events. */}
          {match.status === 'full_time' && !authApi.isScorer() && (
            <button className="cockpit-btn cockpit-btn--quiet" onClick={handleReopen} disabled={actionLoading}>
              <RotateCcw size={18} aria-hidden="true" /> Reopen Match to LIVE
            </button>
          )}
          {match.stage !== 'group' && match.status === 'full_time' && !authApi.isScorer() && (
            <div className="cockpit-winner">
              <span>Winner:</span>
              {teamSides.map((t) => (
                <button
                  key={t.id}
                  className={`btn btn-sm ${match.winner_id === t.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleWinnerOverride(t.id)}
                  disabled={actionLoading}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="cockpit-grid">
        {/* Event pad: type, team, player, minute */}
        <section className="card cockpit-pad">
          <h3 className="cockpit-h"><Zap size={17} aria-hidden="true" /> Log Match Event</h3>
          <form onSubmit={handleAddEvent}>
            <div className="field">
              <label id="event-type-label">Event Type</label>
              <div className="pad-types" role="group" aria-labelledby="event-type-label">
                {eventTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    aria-pressed={eventType === type.id}
                    className={`pad-type ${eventType === type.id ? 'is-on' : ''}`}
                    onClick={() => setEventType(type.id)}
                  >
                    <EventIcon type={type.id} size={20} title={false} />
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label id="event-team-label">Team</label>
              <div className="pad-teams" role="group" aria-labelledby="event-team-label">
                {teamSides.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={t.name}
                    aria-pressed={eventTeamId === t.id}
                    className={`pad-team ${eventTeamId === t.id ? 'is-on' : ''}`}
                    style={{ '--team-color': t.color || '#64748B' }}
                    onClick={() => pickTeam(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label id="event-chips-label">Tap the player</label>
              <div className="pad-chips" role="group" aria-labelledby="event-chips-label">
                {activeTeamPlayers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={eventPlayerId === p.id}
                    className={`player-chip ${eventPlayerId === p.id ? 'is-on' : ''}`}
                    onClick={() => setEventPlayerId(p.id)}
                  >
                    <span className="player-chip__no num">{p.number}</span>
                    <span className="player-chip__name">{p.name}</span>
                  </button>
                ))}
                {activeTeamPlayers.length === 0 && <span className="pad-empty">No players on this squad yet.</span>}
              </div>
            </div>

            <div className="pad-fields">
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
                      #{p.number} {p.name}
                    </option>
                  ))}
                </select>
              </div>

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
                    {assistOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.number} {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {eventType !== 'potm' && (
                <div className="field">
                  <label htmlFor="event-minute">Match Minute (1 - 120, required)</label>
                  <input
                    id="event-minute"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="120"
                    required
                    className="input num pad-minute"
                    placeholder="e.g. 34"
                    value={eventMinute}
                    onFocus={(e) => e.target.select()} // typing replaces the clock's suggestion instead of extending it
                    onChange={(e) => {
                      setMinuteTouched(true);
                      setEventMinute(e.target.value);
                    }}
                  />
                  <span className="pad-hint">
                    {minuteTouched && clockMinute ? (
                      <button type="button" className="link-btn" onClick={() => setMinuteTouched(false)}>
                        Use the match clock ({clockMinute}&prime;)
                      </button>
                    ) : clockMinute ? (
                      'Follows the match clock'
                    ) : (
                      'Enter the minute'
                    )}
                  </span>
                </div>
              )}
            </div>

            <button type="submit" className="cockpit-btn cockpit-btn--submit" disabled={actionLoading}>
              <Plus size={18} aria-hidden="true" /> Submit Event
            </button>
          </form>
        </section>

        {/* Recorded events */}
        <section className="card cockpit-events">
          <h3 className="cockpit-h">Recorded Match Events ({match.events?.length || 0})</h3>
          <ul className="cockpit-events__list">
            {(match.events || []).map((evt) => (
              <li key={evt.id} className="cockpit-event">
                <span className="cockpit-event__min num">{evt.minute ? `${evt.minute}'` : ''}</span>
                <EventIcon type={evt.type} size={17} />
                <span className="cockpit-event__who">
                  <span className="cockpit-event__name">{evt.player_name}</span>
                  <span className="cockpit-event__sub">
                    {evt.type.toUpperCase()}
                    {evt.assist_player_name ? ` · Assist: ${evt.assist_player_name}` : ''}
                  </span>
                </span>
                <button
                  className="btn btn-sm btn-danger cockpit-event__del"
                  onClick={() => handleDeleteEvent(evt.id)}
                  disabled={actionLoading}
                  title="Remove this event"
                  aria-label={`Remove ${evt.type} by ${evt.player_name}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {(!match.events || match.events.length === 0) && (
            <div className="cockpit-empty">No events recorded for this match yet.</div>
          )}
        </section>
      </div>

      {/* Lineups */}
      <section className="card cockpit-lineups">
        <div className="cockpit-lineups__head">
          <div>
            <h3 className="cockpit-h">Match Lineups ({selectedLineup.length} Selected)</h3>
            <p>Select all players who took the pitch in this match to track their appearances.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSaveLineup} disabled={actionLoading}>
            Save Lineups
          </button>
        </div>
        <div className="grid-2">
          {[
            { side: teamSides[0], players: team1Players },
            { side: teamSides[1], players: team2Players },
          ].map(({ side, players }) => (
            <div key={side.id} className="lineup-col" style={{ '--team-color': side.color || '#64748B' }}>
              <div className="lineup-col__title">{side.name} Squad</div>
              <div className="lineup-col__rows">
                {players.map((p) => (
                  <label key={p.id} className={`lineup-row ${selectedLineup.includes(p.id) ? 'is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedLineup.includes(p.id)}
                      onChange={() => handleToggleLineupPlayer(p.id)}
                    />
                    <span>#{p.number} {p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
