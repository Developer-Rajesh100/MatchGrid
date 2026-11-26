import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, Clock, MapPin, Flame, Users } from 'lucide-react';
import { useTournament } from '../../context/TournamentContext';
import { matchesApi } from '../../api/matches';
import { standingsApi } from '../../api/standings';
import { statisticsApi } from '../../api/statistics';
import { teamsApi } from '../../api/teams';
import { MatchRow } from '../../components/match/MatchRow';
import { Scoreboard } from '../../components/match/Scoreboard';
import { StandingsTable } from '../../components/standings/StandingsTable';
import { LeaderCard } from '../../components/stats/LeaderCard';
import { TeamMark } from '../../components/common/TeamMark';
import { ScoreLine } from '../../components/common/ScoreLine';
import { LoadingState, ErrorState } from '../../components/common/Common';
import { useLiveSocket } from '../../hooks/useLiveSocket';
import { useNow } from '../../hooks/useNow';
import { clockOffsetMs, minuteLabel } from '../../utils/clock';
import { formatDay, formatWhen } from '../../utils/dates';
import { stageLabel } from '../../utils/matchLabels';
import { tPath } from '../../utils/paths';

const STAGE_NAMES = {
  group: 'Group stage',
  quarters: 'Quarter-finals',
  semis: 'Semi-finals',
  final: 'Final',
  champions: 'Completed',
};

function FixtureTile({ label, match, slug, result = false }) {
  return (
    <Link to={tPath(slug, `matches/${match.id}`)} className="fixture-tile">
      <div className="fixture-tile__head">
        <span className="fixture-tile__label">{label}</span>
        <span className="fixture-tile__when">
          {result ? formatDay(match.date) : formatWhen(match.date, match.time)}
        </span>
      </div>
      <div className="fixture-tile__body">
        <TeamMark name={match.team1_name} color={match.team1_color} crestUrl={match.team1_crest_url} size={28} />
        <span className="fixture-tile__mid">
          {result ? <ScoreLine home={match.score1} away={match.score2} size="md" /> : <span className="fixture-tile__vs">vs</span>}
        </span>
        <TeamMark name={match.team2_name} color={match.team2_color} crestUrl={match.team2_crest_url} size={28} align="right" />
      </div>
      <div className="fixture-tile__foot">
        <span>{[stageLabel(match), match.venue].filter(Boolean).join(' · ')}</span>
        <span className="fixture-tile__cta">
          {result ? 'Full details' : 'Match centre'} <ArrowRight size={12} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

export function TournamentOverviewPage() {
  const navigate = useNavigate();
  const { tournament, tournamentId, slug } = useTournament();

  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [leaderboards, setLeaderboards] = useState(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const now = useNow(20000);

  const loadData = useCallback(async (showLoading = true) => {
    if (!tournamentId && !slug) return;
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const queryParams = tournamentId ? { tournament_id: tournamentId } : { slug };

      const [tmData, mData, sData, lData] = await Promise.all([
        teamsApi.getTeams(queryParams).catch(() => []),
        matchesApi.getMatches(queryParams).catch(() => []),
        standingsApi.getStandings(queryParams).catch(() => []),
        statisticsApi.getLeaderboards(queryParams).catch(() => null),
      ]);

      setTeams(tmData || []);
      setMatches(mData || []);
      setClockOffset(clockOffsetMs((mData || [])[0], Date.now()));
      setStandings(sData || []);
      setLeaderboards(lData);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load tournament data');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [tournamentId, slug]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  useLiveSocket(useCallback(() => { loadData(false); }, [loadData]), tournamentId);

  const { liveMatches, upcomingMatches, completedMatches } = useMemo(
    () => ({
      liveMatches: matches.filter((m) => m.status === 'live'),
      upcomingMatches: matches.filter((m) => m.status === 'upcoming'),
      completedMatches: matches.filter((m) => m.status === 'full_time' || m.status === 'completed'),
    }),
    [matches]
  );

  if (loading) return <LoadingState message="Loading tournament overview..." />;
  if (error) return <ErrorState message={error} onRetry={() => loadData(true)} />;

  const featuredLive = liveMatches[0] || null;
  const nextMatch = upcomingMatches[0] || null;
  const latestResult = completedMatches.length > 0 ? completedMatches[completedMatches.length - 1] : null;
  const basePath = `/t/${slug}`;

  const facts = [
    { label: 'Stage', value: STAGE_NAMES[tournament?.stage] || 'Group stage' },
    { label: 'Clubs', value: teams.length, num: true },
    { label: 'Fixtures', value: matches.length, num: true },
    { label: 'Played', value: completedMatches.length, num: true },
    { label: 'To play', value: upcomingMatches.length, num: true },
    { label: 'Golden Boot', value: leaderboards?.top_scorers?.[0]?.player_name || '—' },
  ];

  return (
    <div className="tournament-overview-page">
      {featuredLive && (
        <section className="card live-hero" aria-label="Live match">
          <div className="live-hero__head">
            <span className="live-hero__title">
              <span className="pill pill-live">
                <span className="pill-dot" /> Live match
              </span>
              <span className="match-title">
                <span className="match-title__no">Match #{featuredLive.match_number}</span>
                {stageLabel(featuredLive) && <span className="match-title__stage">{stageLabel(featuredLive)}</span>}
              </span>
            </span>
            <Link to={tPath(slug, `matches/${featuredLive.id}`)} className="btn btn-sm btn-primary">
              Open Match Center <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <Scoreboard
            match={featuredLive}
            variant="hero"
            onTeamClick={(teamId) => navigate(tPath(slug, `teams/${teamId}`))}
            center={
              <span className={`hero-minute num ${featuredLive.is_half_time ? 'is-ht' : ''}`}>
                {minuteLabel(featuredLive, clockOffset, now)}
                <span className="hero-minute__state">{featuredLive.is_half_time ? 'Half time' : 'In progress'}</span>
              </span>
            }
          />

          <div className="live-hero__meta">
            {featuredLive.venue && <span><MapPin size={13} aria-hidden="true" />{featuredLive.venue}</span>}
            {featuredLive.date && <span><Calendar size={13} aria-hidden="true" />{formatDay(featuredLive.date)}</span>}
            {featuredLive.time && <span><Clock size={13} aria-hidden="true" />{featuredLive.time}</span>}
          </div>
        </section>
      )}

      {(nextMatch || latestResult) && (
        <div className="grid-2 overview-tiles">
          {nextMatch ? (
            <FixtureTile label="Next scheduled" match={nextMatch} slug={slug} />
          ) : (
            <div className="card empty-note">Nothing left to schedule</div>
          )}
          {latestResult ? (
            <FixtureTile label="Latest result" match={latestResult} slug={slug} result />
          ) : (
            <div className="card empty-note">No completed matches recorded yet</div>
          )}
        </div>
      )}

      <dl className="facts">
        {facts.map((f) => (
          <div className="facts__item" key={f.label}>
            <dt>{f.label}</dt>
            <dd className={f.num ? 'num' : ''} title={String(f.value)}>{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid-2 overview-cols">
        <div>
          <div className="section-title">
            <h2>Group Standings</h2>
            <NavLink to={`${basePath}/standings`} className="section-link">
              Full tables <ArrowRight size={14} aria-hidden="true" />
            </NavLink>
          </div>
          {standings.length === 0 ? (
            <div className="card empty-note">
              No group tables formed yet. Standings will appear once tournament groups and matches are scheduled.
            </div>
          ) : (
            standings.map((grp) => (
              <StandingsTable key={grp.group_id} groupName={grp.group_name} standings={grp.standings} showLegend={false} />
            ))
          )}
        </div>

        <div>
          <div className="section-title">
            <h2>Recent & Upcoming Fixtures</h2>
            <NavLink to={`${basePath}/matches`} className="section-link">
              All fixtures <ArrowRight size={14} aria-hidden="true" />
            </NavLink>
          </div>

          <div className="fixture-list">
            {matches.length === 0 ? (
              <div className="card empty-note">No fixtures scheduled yet. Matches will appear here once drawn.</div>
            ) : (
              matches.slice(0, 4).map((m) => <MatchRow key={m.id} match={m} />)
            )}
          </div>

          <div className="section-title">
            <h2>Tournament Leaders</h2>
            <NavLink to={`${basePath}/stats`} className="section-link">
              All rankings <ArrowRight size={14} aria-hidden="true" />
            </NavLink>
          </div>
          <div className="grid-2">
            <LeaderCard title="Golden Boot" icon={Flame} unit="goals" items={leaderboards?.top_scorers || []} limit={4} />
            <LeaderCard title="Top Playmakers" icon={Users} unit="assists" items={leaderboards?.top_assists || []} limit={4} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TournamentOverviewPage;
