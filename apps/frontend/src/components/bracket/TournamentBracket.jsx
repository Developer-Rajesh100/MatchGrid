import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { matchesApi } from '../../api/matches';
import './TournamentBracket.css';
import { useTournament } from '../../context/TournamentContext';
import { tPath } from '../../utils/paths';

export default function TournamentBracket({ tournamentId, refreshTrigger = 0 }) {
  const { slug } = useTournament();
  const [bracket, setBracket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedTournament = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const fetchBracket = async () => {
      try {
        // Only the first load of a tournament shows the full spinner; live refreshes update the
        // tree in place instead of flashing it away on every WebSocket message.
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
        if (isMounted) {
          setError(err.message || 'Failed to load knockout bracket');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchBracket();
    return () => {
      isMounted = false;
    };
  }, [tournamentId, refreshTrigger]);

  if (loading) {
    return (
      <div className="bracket-loading" data-testid="bracket-loading">
        <div className="spinner"></div>
        <p>Loading knockout bracket...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bracket-error" data-testid="bracket-error">
        <p className="error-text">⚠️ {error}</p>
      </div>
    );
  }

  const rounds = bracket?.rounds || [];
  const champion = bracket?.champion;
  const hasMatches = rounds.some((r) => r.matches && r.matches.length > 0);

  if (!hasMatches && bracket?.knockout_format === 'none') {
    return (
      <div className="bracket-empty-state" data-testid="bracket-none">
        <div className="empty-icon">🏆</div>
        <h3>No Knockout Stage</h3>
        <p>This tournament is decided on the group table, so there is no bracket.</p>
      </div>
    );
  }

  if (!hasMatches) {
    return (
      <div className="bracket-empty-state" data-testid="bracket-empty">
        <div className="empty-icon">🏆</div>
        <h3>Knockout Stage Pending</h3>
        <p>
          The knockout bracket will be dynamically populated once the group stage fixtures conclude.
        </p>
      </div>
    );
  }

  return (
    <div className="tournament-bracket-wrapper" data-testid="tournament-bracket">
      {champion && (
        <div className="champion-banner" data-testid="champion-banner">
          <div className="champion-trophy">🏆</div>
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

      <div className="bracket-rounds-container">
        {rounds.map((round, rIdx) => (
          <div key={round.round_order || rIdx} className="bracket-round-column" data-testid={`bracket-round-${round.round_order}`}>
            <div className="bracket-round-header">
              <span className="round-badge">R{round.round_order}</span>
              <h4 className="round-title">{round.round_name}</h4>
            </div>

            <div className="bracket-round-matches">
              {round.matches.map((m) => {
                const isLive = m.status === 'live';
                const isFullTime = m.status === 'full_time';
                const team1Winner = isFullTime && m.winner_id && m.team1 && m.winner_id === m.team1.id;
                const team2Winner = isFullTime && m.winner_id && m.team2 && m.winner_id === m.team2.id;

                const CardContent = (
                  <div
                    className={`bracket-match-card ${isLive ? 'is-live' : ''} ${isFullTime ? 'is-completed' : ''}`}
                    data-testid={`match-card-${m.bracket_slot}`}
                  >
                    <div className="match-card-meta">
                      <span className="match-slot-label">{m.bracket_slot || m.label || `Match #${m.match_number}`}</span>
                      <span className={`match-status-badge status-${m.status}`}>
                        {isLive ? '● LIVE' : isFullTime ? 'FT' : 'SCHEDULED'}
                      </span>
                    </div>

                    <div className="match-card-teams">
                      {/* Team 1 */}
                      <div className={`bracket-team-row ${team1Winner ? 'winner-row' : ''}`}>
                        <div className="team-identity">
                          {m.team1?.crest_url ? (
                            <img src={m.team1.crest_url} alt={m.team1.name} className="bracket-team-crest" />
                          ) : (
                            <div className="bracket-team-avatar">
                              {m.team1 ? m.team1.name.slice(0, 2).toUpperCase() : 'TBD'}
                            </div>
                          )}
                          <span className={`bracket-team-name ${!m.team1 ? 'tbd' : ''}`}>
                            {m.team1 ? m.team1.name : 'TBD'}
                          </span>
                        </div>
                        <span className="bracket-team-score">
                          {m.score1}
                          {isFullTime && m.score1 === m.score2 && team1Winner ? ' (P)' : ''}
                        </span>
                      </div>

                      {/* Team 2 */}
                      <div className={`bracket-team-row ${team2Winner ? 'winner-row' : ''}`}>
                        <div className="team-identity">
                          {m.team2?.crest_url ? (
                            <img src={m.team2.crest_url} alt={m.team2.name} className="bracket-team-crest" />
                          ) : (
                            <div className="bracket-team-avatar">
                              {m.team2 ? m.team2.name.slice(0, 2).toUpperCase() : 'TBD'}
                            </div>
                          )}
                          <span className={`bracket-team-name ${!m.team2 ? 'tbd' : ''}`}>
                            {m.team2 ? m.team2.name : 'TBD'}
                          </span>
                        </div>
                        <span className="bracket-team-score">
                          {m.score2}
                          {isFullTime && m.score1 === m.score2 && team2Winner ? ' (P)' : ''}
                        </span>
                      </div>
                    </div>

                    {m.notes && <div className="bracket-match-notes">{m.notes}</div>}
                  </div>
                );

                return m.match_id ? (
                  <Link
                    key={m.bracket_slot || m.match_id}
                    to={tPath(slug, `matches/${m.match_id}`)}
                    className="bracket-match-link"
                  >
                    {CardContent}
                  </Link>
                ) : (
                  <div key={m.bracket_slot || rIdx} className="bracket-match-link">
                    {CardContent}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
