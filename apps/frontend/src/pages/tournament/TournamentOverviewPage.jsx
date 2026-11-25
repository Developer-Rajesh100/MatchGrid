import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Calendar, ArrowRight, Clock, MapPin, Trophy, ChevronRight, Flame, Users } from 'lucide-react';
import { useTournament } from '../../context/TournamentContext';
import { matchesApi } from '../../api/matches';
import { standingsApi } from '../../api/standings';
import { statisticsApi } from '../../api/statistics';
import { teamsApi } from '../../api/teams';
import { MatchRow } from '../../components/match/MatchRow';
import { StandingsTable } from '../../components/standings/StandingsTable';
import { LeaderCard } from '../../components/stats/LeaderCard';
import { Avatar } from '../../components/common/Avatar';
import { LoadingState, ErrorState, StatTile } from '../../components/common/Common';
import { useLiveSocket } from '../../hooks/useLiveSocket';
import { tPath } from '../../utils/paths';

export function TournamentOverviewPage() {
  const navigate = useNavigate();
  const { tournament, tournamentId, slug } = useTournament();

  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [leaderboards, setLeaderboards] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  useLiveSocket(
    useCallback(() => {
      loadData(false);
    }, [loadData]),
    tournamentId
  );

  if (loading) return <LoadingState message="Loading tournament overview..." />;
  if (error) return <ErrorState message={error} onRetry={() => loadData(true)} />;

  const liveMatches = matches.filter((m) => m.status === 'live');
  const upcomingMatches = matches.filter((m) => m.status === 'upcoming');
  const completedMatches = matches.filter((m) => m.status === 'full_time' || m.status === 'completed');

  const featuredLive = liveMatches[0] || null;
  const nextMatch = upcomingMatches[0] || null;
  const latestResult = completedMatches.length > 0 ? completedMatches[completedMatches.length - 1] : null;

  const basePath = `/t/${slug}`;

  return (
    <div className="tournament-overview-page">
      {/* Featured LIVE Hero Card */}
      {featuredLive && (
        <div className="hero-live-card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="pill pill-live">
                <span className="pill-dot" /> LIVE MATCH
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Match #{featuredLive.match_number} &bull; {featuredLive.label || 'Match'}
              </span>
            </div>
            <button
              onClick={() => navigate(tPath(slug, `matches/${featuredLive.id}`))}
              className="btn btn-sm btn-primary"
            >
              Open Match Center <ChevronRight size={14} />
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              margin: '18px 0',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            {/* Team 1 */}
            <div
              onClick={() => featuredLive.team1_id && navigate(tPath(slug, `teams/${featuredLive.team1_id}`))}
              style={{ textAlign: 'center', flex: '1 1 180px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                <Avatar
                  name={featuredLive.team1_name || 'TBD'}
                  photoUrl={featuredLive.team1_logo}
                  size={58}
                  color={featuredLive.team1_color || '#10B981'}
                />
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {featuredLive.team1_name || 'TBD'}
              </h3>
            </div>

            {/* Score Center */}
            <div style={{ textAlign: 'center', padding: '0 20px' }}>
              <div
                className="hero-score"
                style={{
                  fontSize: '48px',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  lineHeight: 1,
                }}
              >
                {featuredLive.score1 ?? 0} &ndash; {featuredLive.score2 ?? 0}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: featuredLive.is_half_time ? 'var(--accent-gold)' : 'var(--status-live)',
                  marginTop: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                }}
              >
                {featuredLive.is_half_time ? 'Half Time' : 'Match In Progress'}
              </div>
            </div>

            {/* Team 2 */}
            <div
              onClick={() => featuredLive.team2_id && navigate(tPath(slug, `teams/${featuredLive.team2_id}`))}
              style={{ textAlign: 'center', flex: '1 1 180px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                <Avatar
                  name={featuredLive.team2_name || 'TBD'}
                  photoUrl={featuredLive.team2_logo}
                  size={58}
                  color={featuredLive.team2_color || '#34D399'}
                />
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {featuredLive.team2_name || 'TBD'}
              </h3>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '20px',
              fontSize: '12.5px',
              color: 'var(--text-secondary)',
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '14px',
              marginTop: '16px',
              flexWrap: 'wrap',
            }}
          >
            {featuredLive.venue && (
              <span><MapPin size={13} style={{ display: 'inline', marginRight: '5px' }} />{featuredLive.venue}</span>
            )}
            {featuredLive.date && (
              <span><Calendar size={13} style={{ display: 'inline', marginRight: '5px' }} />{featuredLive.date}</span>
            )}
            {featuredLive.time && (
              <span><Clock size={13} style={{ display: 'inline', marginRight: '5px' }} />{featuredLive.time}</span>
            )}
          </div>
        </div>
      )}

      {/* Featured Cards: Next Match & Latest Result */}
      {(nextMatch || latestResult) && (
        <div className="grid-2" style={{ marginBottom: '28px' }}>
          {nextMatch ? (
            <div
              className="card card-clickable"
              onClick={() => navigate(tPath(slug, `matches/${nextMatch.id}`))}
              style={{ borderLeft: '4px solid var(--accent-gold)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--accent-gold)' }}>
                  Next Scheduled &bull; #{nextMatch.match_number}
                </span>
                <span className="pill pill-upcoming" style={{ fontSize: '10.5px' }}>Upcoming</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <Avatar name={nextMatch.team1_name || 'TBD'} photoUrl={nextMatch.team1_logo} size={32} color={nextMatch.team1_color || '#10B981'} />
                  <span style={{ fontWeight: 600, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nextMatch.team1_name || 'TBD'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '12px', padding: '0 10px', flexShrink: 0 }}>
                  VS
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
                  <span style={{ fontWeight: 600, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nextMatch.team2_name || 'TBD'}
                  </span>
                  <Avatar name={nextMatch.team2_name || 'TBD'} photoUrl={nextMatch.team2_logo} size={32} color={nextMatch.team2_color || '#34D399'} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', flexWrap: 'wrap' }}>
                {nextMatch.date && <span><Calendar size={12} style={{ display: 'inline', marginRight: '4px' }} />{nextMatch.date}</span>}
                {nextMatch.time && <span><Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />{nextMatch.time}</span>}
                {nextMatch.venue && <span><MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />{nextMatch.venue}</span>}
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No upcoming fixtures scheduled
            </div>
          )}

          {latestResult ? (
            <div
              className="card card-clickable"
              onClick={() => navigate(tPath(slug, `matches/${latestResult.id}`))}
              style={{ borderLeft: '4px solid var(--brand-primary)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--brand-primary)' }}>
                  Latest Result &bull; #{latestResult.match_number}
                </span>
                <span className="pill pill-full-time" style={{ fontSize: '10.5px' }}>Full Time</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <Avatar name={latestResult.team1_name} photoUrl={latestResult.team1_logo} size={32} color={latestResult.team1_color || '#10B981'} />
                  <span style={{ fontWeight: latestResult.winner_id === latestResult.team1_id ? 700 : 500, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {latestResult.team1_name}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', padding: '0 10px', color: 'var(--text-primary)', flexShrink: 0 }}>
                  {latestResult.score1} &ndash; {latestResult.score2}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
                  <span style={{ fontWeight: latestResult.winner_id === latestResult.team2_id ? 700 : 500, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {latestResult.team2_name}
                  </span>
                  <Avatar name={latestResult.team2_name} photoUrl={latestResult.team2_logo} size={32} color={latestResult.team2_color || '#34D399'} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                <span>{latestResult.date} &bull; {latestResult.venue || 'Stadium'}</span>
                <span style={{ color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                  Full Details <ArrowRight size={12} />
                </span>
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No completed matches recorded yet
            </div>
          )}
        </div>
      )}

      {/* Overview Stats */}
      <div className="stat-grid" style={{ marginBottom: '32px' }}>
        <StatTile label="Tournament Stage" value={tournament?.stage?.toUpperCase() || 'GROUP'} />
        <StatTile label="Clubs" value={teams.length} />
        <StatTile label="Total Fixtures" value={matches.length} />
        <StatTile label="Completed" value={completedMatches.length} />
        <StatTile label="Upcoming" value={upcomingMatches.length} />
        <StatTile label="Golden Boot" value={leaderboards?.top_scorers?.[0]?.player_name || '—'} />
      </div>

      {/* Standings & Matches Grid */}
      <div className="grid-2" style={{ marginBottom: '36px' }}>
        {/* Left: Standings Preview */}
        <div>
          <div className="section-title">
            <h2>Group Standings</h2>
            <NavLink to={`${basePath}/standings`} style={{ fontSize: '13px', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
              Full tables <ArrowRight size={14} />
            </NavLink>
          </div>
          {standings.length === 0 ? (
            <div className="card text-center" style={{ padding: '28px', color: 'var(--text-muted)' }}>
              No group tables formed yet. Standings will appear once tournament groups and matches are scheduled.
            </div>
          ) : (
            standings.map((grp) => (
              <StandingsTable
                key={grp.group_id}
                groupName={grp.group_name}
                standings={grp.standings}
                showLegend={false}
              />
            ))
          )}
        </div>

        {/* Right: Fixtures & Leaders */}
        <div>
          <div className="section-title">
            <h2>Recent & Upcoming Fixtures</h2>
            <NavLink to={`${basePath}/matches`} style={{ fontSize: '13px', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
              All fixtures <ArrowRight size={14} />
            </NavLink>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
            {matches.length === 0 ? (
              <div className="card text-center" style={{ padding: '24px', color: 'var(--text-muted)' }}>
                No fixtures scheduled yet. Matches will appear here once drawn.
              </div>
            ) : (
              matches.slice(0, 4).map((m) => (
                <MatchRow key={m.id} match={m} />
              ))
            )}
          </div>

          {/* Leaders Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="section-title">
              <h2>Tournament Leaders</h2>
              <NavLink to={`${basePath}/stats`} style={{ fontSize: '13px', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                All rankings <ArrowRight size={14} />
              </NavLink>
            </div>
            <div className="grid-2" style={{ gap: '14px' }}>
              <LeaderCard
                title="Golden Boot"
                icon={Flame}
                unit="goals"
                items={leaderboards?.top_scorers || []}
                limit={4}
              />
              <LeaderCard
                title="Top Playmakers"
                icon={Users}
                unit="assists"
                items={leaderboards?.top_assists || []}
                limit={4}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TournamentOverviewPage;
