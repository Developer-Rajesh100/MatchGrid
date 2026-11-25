import React from 'react';
import { Link } from 'react-router-dom';
import { TeamMark } from '../common/TeamMark';
import { minuteLabel } from '../../utils/clock';
import { useNow } from '../../hooks/useNow';

/**
 * Compact strip of matches in play right now, across all tournaments. Each card is a two-row scoreboard:
 * team (with its colour bar) and score, with the match minute and tournament above.
 */
export function LiveNowStrip({ matches = [], liveCount = 0, tournamentCount = 0, offsetMs = 0 }) {
  const now = useNow(20000);
  if (!matches.length) return null;

  return (
    <section className="live-strip" aria-label="Live now">
      <div className="live-strip__head">
        <span className="live-dot" aria-hidden="true" />
        <h2>Live now</h2>
        <span className="live-strip__count">
          {liveCount} {liveCount === 1 ? 'match' : 'matches'} live
          {tournamentCount > 1 ? ` across ${tournamentCount} tournaments` : ''}
        </span>
      </div>
      <div className="live-strip__scroller">
        {matches.map((m) => (
          <Link
            key={m.id}
            to={`/t/${m.tournament_slug || m.tournament_id}/matches/${m.id}`}
            className="live-card"
          >
            <span className="live-card__meta">
              <span className={`live-card__minute num ${m.is_half_time ? 'is-ht' : ''}`}>{minuteLabel(m, offsetMs, now)}</span>
              <span className="live-card__tournament">{m.tournament_name}</span>
            </span>
            {[
              { name: m.team1_name, color: m.team1_color, crest: m.team1_crest_url, score: m.score1 },
              { name: m.team2_name, color: m.team2_color, crest: m.team2_crest_url, score: m.score2 },
            ].map((side, i) => (
              <span className="live-card__row" key={i}>
                <TeamMark name={side.name} color={side.color} crestUrl={side.crest} size={20} />
                <span className="live-card__score num">{side.score ?? 0}</span>
              </span>
            ))}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default LiveNowStrip;
