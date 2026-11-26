import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, TriangleAlert, ChevronsRight } from 'lucide-react';
import { matchesApi } from '../../api/matches';
import { Avatar } from '../common/Avatar';
import { useTournament } from '../../context/TournamentContext';
import { tPath } from '../../utils/paths';
import './TournamentBracket.css';

// What a knockout of each format looks like, so rounds that have not been seeded yet still show their place.
const SHAPE = {
  semis_final: [
    { name: 'Semi-finals', slots: ['SF1', 'SF2'] },
    { name: 'Final', slots: ['FINAL'] },
  ],
  quarters_semis_final: [
    { name: 'Quarter-finals', slots: ['QF1', 'QF2', 'QF3', 'QF4'] },
    { name: 'Semi-finals', slots: ['SF1', 'SF2'] },
    { name: 'Final', slots: ['FINAL'] },
  ],
};

/** Real rounds from the API, topped up with empty slots from the format's shape (real rounds only ever grow). */
function layoutRounds(bracket) {
  const real = bracket?.rounds || [];
  const shape = SHAPE[bracket?.knockout_format];
  if (!shape) return real.map((r) => ({ key: r.round_order, name: r.round_name, order: r.round_order, matches: r.matches }));
  const first = real.length ? Math.min(...real.map((r) => r.round_order)) : 1;
  return shape.map((round, i) => {
    const order = first + i;
    const found = real.find((r) => r.round_order === order);
    const matches = round.slots.map((slot, j) => found?.matches?.find((m) => m.bracket_slot === slot) || found?.matches?.[j] || { bracket_slot: slot, placeholder: true, status: 'upcoming', score1: 0, score2: 0 });
    return { key: order, name: found?.round_name || round.name, order, matches };
  });
}

function TeamRow({ team, score, winner, penalties }) {
  return (
    <div className={`bracket-team-row ${winner ? 'winner-row' : ''}`} style={{ '--team-color': team?.color || 'transparent' }}>
      <span className="team-identity">
        {team ? (
          <Avatar name={team.name} crestUrl={team.crest_url} color={team.color} size={22} />
        ) : (
          <span className="bracket-team-avatar">TBD</span>
        )}
        <span className={`bracket-team-name ${!team ? 'tbd' : ''}`}>{team ? team.name : 'TBD'}</span>
      </span>
      <span className="bracket-team-score num">
        {score}
        {penalties && <span className="bracket-pens" title="Won on penalties"> (P)</span>}
      </span>
    </div>
  );
}

function MatchCard({ m, slug }) {
  const isLive = m.status === 'live';
  const isFullTime = m.status === 'full_time';
  const level = isFullTime && m.score1 === m.score2;
  const t1Win = isFullTime && m.winner_id && m.team1 && m.winner_id === m.team1.id;
  const t2Win = isFullTime && m.winner_id && m.team2 && m.winner_id === m.team2.id;

  const card = (
    <div
      className={`bracket-match-card ${isLive ? 'is-live' : ''} ${isFullTime ? 'is-completed' : ''} ${m.placeholder ? 'is-placeholder' : ''}`}
      data-testid={`match-card-${m.bracket_slot}`}
    >
      <div className="match-card-meta">
        <span className="match-slot-label">{m.bracket_slot || m.label || `Match #${m.match_number}`}</span>
        <span className={`match-status-badge status-${m.status}`}>
          {isLive ? '● LIVE' : isFullTime ? 'FT' : 'SCHEDULED'}
        </span>
      </div>
      <div className="match-card-teams">
        <TeamRow team={m.team1} score={m.score1} winner={t1Win} penalties={level && t1Win} />
        <TeamRow team={m.team2} score={m.score2} winner={t2Win} penalties={level && t2Win} />
      </div>
      {m.notes && <div className="bracket-match-notes">{m.notes}</div>}
    </div>
  );

  return m.match_id ? (
    <Link to={tPath(slug, `matches/${m.match_id}`)} className="bracket-match-link">{card}</Link>
  ) : (
    <div className="bracket-match-link">{card}</div>
  );
}

export default function TournamentBracket({ tournamentId, refreshTrigger = 0 }) {
  const { slug } = useTournament();
  const [bracket, setBracket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const loadedTournament = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const fetchBracket = async () => {
      try {
        // Only the first load of a tournament shows placeholders; live refreshes update the tree in place.
        if (loadedTournament.current !== tournamentId) {
          setBracket(null);
          setLoading(true);
        }
        setError(null);
        const data = await matchesApi.getBracket(tournamentId);
        if (isMounted) {
          loadedTournament.current = tournamentId;
          setBracket(data);
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load knockout bracket');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchBracket();
    return () => {
      isMounted = false;
    };
  }, [tournamentId, refreshTrigger]);

  if (loading) {
    return (
      <div className="bracket-loading" data-testid="bracket-loading" role="status" aria-live="polite">
        <span className="sr-only">Loading knockout bracket...</span>
        <div className="bracket-skeleton" aria-hidden="true">
          {[4, 2, 1].map((n) => (
            <div key={n} className="bracket-skeleton__col">
              {Array.from({ length: n }, (_, i) => <span key={i} className="skeleton" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bracket-error" data-testid="bracket-error">
        <p className="error-text"><TriangleAlert size={16} aria-hidden="true" /> {error}</p>
      </div>
    );
  }

  const champion = bracket?.champion;
  const hasMatches = (bracket?.rounds || []).some((r) => r.matches && r.matches.length > 0);

  if (!hasMatches && bracket?.knockout_format === 'none') {
    return (
      <div className="bracket-empty-state" data-testid="bracket-none">
        <div className="empty-icon"><Trophy size={30} aria-hidden="true" /></div>
        <h3>No Knockout Stage</h3>
        <p>This tournament is decided on the group table, so there is no bracket.</p>
      </div>
    );
  }

  if (!hasMatches) {
    return (
      <div className="bracket-empty-state" data-testid="bracket-empty">
        <div className="empty-icon"><Trophy size={30} aria-hidden="true" /></div>
        <h3>Knockout Stage Pending</h3>
        <p>The knockout bracket will be dynamically populated once the group stage fixtures conclude.</p>
      </div>
    );
  }

  const rounds = layoutRounds(bracket);

  return (
    <div className="tournament-bracket-wrapper" data-testid="tournament-bracket">
      {champion && (
        <div className="champion-banner" data-testid="champion-banner">
          <div className="champion-trophy"><Trophy size={34} aria-hidden="true" /></div>
          <div className="champion-info">
            <span className="champion-subtitle">TOURNAMENT CHAMPION</span>
            <div className="champion-team">
              {champion.crest_url ? (
                <img src={champion.crest_url} alt={champion.name} className="champion-crest" />
              ) : (
                <div className="team-avatar-placeholder">{champion.name.slice(0, 2).toUpperCase()}</div>
              )}
              <h2 className="champion-name">{champion.name}</h2>
            </div>
          </div>
        </div>
      )}

      {rounds.length > 1 && !scrolled && (
        <p className="bracket-hint" aria-hidden="true">
          Swipe to follow the bracket <ChevronsRight size={14} />
        </p>
      )}

      <div
        className="bracket-scroll"
        tabIndex={0}
        role="region"
        aria-label="Knockout bracket, scrolls sideways"
        onScroll={(e) => { if (e.currentTarget.scrollLeft > 24) setScrolled(true); }}
      >
        <div className="bracket-rounds-container">
          {rounds.map((round, rIdx) => {
            const played = round.matches.filter((m) => m.status === 'full_time').length;
            const hasNext = rIdx < rounds.length - 1;
            // matches that feed the same next-round match are grouped so one connector can join them
            const groups = [];
            for (let i = 0; i < round.matches.length; i += 2) groups.push(round.matches.slice(i, i + 2));
            return (
              <div
                key={round.key}
                className={`bracket-round-column ${hasNext ? 'has-next' : ''}`}
                data-testid={`bracket-round-${round.order}`}
              >
                <div className="bracket-round-header">
                  <h4 className="round-title">{round.name}</h4>
                  <span className="round-progress num">{played}/{round.matches.length}</span>
                </div>
                <div className="bracket-round-matches">
                  {groups.map((group, gi) => (
                    <div key={gi} className={`bracket-pair ${group.length === 2 ? 'is-pair' : 'is-single'}`}>
                      {group.map((m) => (
                        <MatchCard key={m.bracket_slot || m.match_id} m={m} slug={slug} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
