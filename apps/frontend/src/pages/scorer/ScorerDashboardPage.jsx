import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchesApi } from '../../api/matches';
import { authApi } from '../../api/auth';
import { useLiveSocket } from '../../hooks/useLiveSocket';
import { useNow } from '../../hooks/useNow';
import { StatusPill } from '../../components/common/StatusPill';
import { TeamMark } from '../../components/common/TeamMark';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/Common';
import { RefreshCw, ChevronRight, Activity, Calendar, ChevronDown } from 'lucide-react';
import { clockOffsetMs, minuteLabel } from '../../utils/clock';
import { formatWhen } from '../../utils/dates';
import { stageLabel } from '../../utils/matchLabels';
import { isClosed, isPlayed } from '../../utils/matchStatus';

const kickoff = (m) => `${m.date || '9999-12-31'}T${m.time || '23:59'}`;

function MatchCard({ match, offset, now, onOpen }) {
  const live = match.status === 'live';
  const finished = isClosed(match);
  const played = isPlayed(match);
  const title = [stageLabel(match), match.tournament_name].filter(Boolean).join(' · ');

  return (
    <article
      className={`scorer-card ${live ? 'scorer-card--live' : finished ? 'scorer-card--finished' : ''}`}
      data-testid={`scorer-match-card-${match.id}`}
    >
      <div className="scorer-card__head">
        <span className="scorer-card__no num">Match #{match.match_number}</span>
        {match.tournament_name && <span className="scorer-card__tournament" title={match.tournament_name}>{match.tournament_name}</span>}
        <StatusPill status={match.status} isHalfTime={match.is_half_time} />
      </div>

      <div className="scorer-card__teams">
        {[
          { name: match.team1_name, color: match.team1_color, crest: match.team1_crest_url, score: match.score1 },
          { name: match.team2_name, color: match.team2_color, crest: match.team2_crest_url, score: match.score2 },
        ].map((side, i) => (
          <div className="scorer-card__team" key={i}>
            <TeamMark name={side.name} color={side.color} crestUrl={side.crest} size={30} />
            <span className={`scorer-card__score num ${live ? 'is-live' : ''}`} aria-label={played ? `${side.score ?? 0} goals` : undefined}>
              {played ? side.score ?? 0 : '–'}
            </span>
          </div>
        ))}
      </div>

      <div className="scorer-card__foot">
        <span className="scorer-card__when">
          {live ? (
            <span className={`scorer-card__minute num ${match.is_half_time ? 'is-ht' : ''}`}>{minuteLabel(match, offset, now)}</span>
          ) : (
            formatWhen(match.date, match.time) || title
          )}
          {!live && match.venue ? <span className="scorer-card__venue"> · {match.venue}</span> : null}
        </span>
        <button
          onClick={() => onOpen(match.id)}
          className={live ? 'btn btn-primary scorer-card__open' : 'btn btn-outline scorer-card__open'}
          data-testid={`scorer-open-console-${match.id}`}
        >
          <Activity size={14} aria-hidden="true" />
          <span>{live ? 'Open Live Console (Live Now)' : 'Open Match Console'}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function ScorerDashboardPage() {
  const [matches, setMatches] = useState([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const username = authApi.getUsername();
  const role = authApi.getRole();
  const now = useNow(30000);

  const loadAssignedMatches = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await matchesApi.getAssignedMatches();
      setMatches(data || []);
      setClockOffset(clockOffsetMs((data || [])[0], Date.now()));
    } catch (err) {
      setError(err.message || 'Failed to load assigned matches');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssignedMatches();
  }, [loadAssignedMatches]);

  // Real-time updates via live WebSocket
  useLiveSocket(() => {
    loadAssignedMatches(false);
  });

  // Active work first: what is in play, then what is next, then history
  const groups = useMemo(() => {
    const live = matches.filter((m) => m.status === 'live').sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
    const upcoming = matches.filter((m) => m.status === 'upcoming').sort((a, b) => kickoff(a).localeCompare(kickoff(b)));
    const finished = matches.filter(isClosed).sort((a, b) => kickoff(b).localeCompare(kickoff(a)));
    return { live, upcoming, finished };
  }, [matches]);

  const open = (id) => navigate(`/scorer/matches/${id}/live`);
  const nothingActive = groups.live.length === 0 && groups.upcoming.length === 0;

  return (
    <div className="scorer-page">
      <header className="scorer-page__head">
        <div>
          <h1 className="scorer-page__title"><Activity size={22} aria-hidden="true" /> Scorer Cockpit</h1>
          <p className="scorer-page__sub">
            Live match console access for operator <strong>{username}</strong>
            {role && <span className="scorer-page__role">{role}</span>}
          </p>
        </div>
        <button
          onClick={() => loadAssignedMatches(true)}
          className="btn btn-outline"
          disabled={loading}
          data-testid="refresh-scorer-matches"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} aria-hidden="true" />
          <span>Refresh Roster</span>
        </button>
      </header>

      {loading ? (
        <LoadingState message="Loading your assigned matches..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadAssignedMatches(true)} />
      ) : matches.length === 0 ? (
        <div data-testid="scorer-empty-state">
          <EmptyState
            title="No Matches Assigned"
            description="You currently do not have any matches assigned to your scoring roster. When an organizer assigns you to a fixture, it will appear here."
            icon={Calendar}
          />
        </div>
      ) : (
        <div data-testid="scorer-matches-grid" className="scorer-sections">
          <p className="scorer-summary">
            <span className="num">{groups.live.length}</span> live
            <span className="scorer-summary__sep" aria-hidden="true" />
            <span className="num">{groups.upcoming.length}</span> upcoming
            <span className="scorer-summary__sep" aria-hidden="true" />
            <span className="num">{groups.finished.length}</span> finished
          </p>

          {groups.live.length > 0 && (
            <section aria-labelledby="scorer-live-h">
              <h2 id="scorer-live-h" className="scorer-section__title">
                <span className="live-dot" aria-hidden="true" /> Live now
              </h2>
              <div className="scorer-cards scorer-cards--live">
                {groups.live.map((m) => <MatchCard key={m.id} match={m} offset={clockOffset} now={now} onOpen={open} />)}
              </div>
            </section>
          )}

          {groups.upcoming.length > 0 && (
            <section aria-labelledby="scorer-up-h">
              <h2 id="scorer-up-h" className="scorer-section__title">Upcoming</h2>
              <div className="scorer-cards">
                {groups.upcoming.map((m) => <MatchCard key={m.id} match={m} offset={clockOffset} now={now} onOpen={open} />)}
              </div>
            </section>
          )}

          {groups.finished.length > 0 && (
            <details className="scorer-finished" open={nothingActive}>
              <summary className="scorer-section__title scorer-finished__summary">
                <ChevronDown size={16} aria-hidden="true" /> Finished <span className="num">({groups.finished.length})</span>
              </summary>
              <div className="scorer-cards scorer-cards--quiet">
                {groups.finished.map((m) => <MatchCard key={m.id} match={m} offset={clockOffset} now={now} onOpen={open} />)}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default ScorerDashboardPage;
