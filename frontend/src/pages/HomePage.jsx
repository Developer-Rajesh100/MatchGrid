import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Calendar, ArrowRight, Activity, Flame, Users, Clock, MapPin } from 'lucide-react';
import { tournamentApi } from '../api/tournament';
import { matchesApi } from '../api/matches';
import { standingsApi } from '../api/standings';
import { statisticsApi } from '../api/statistics';
import { teamsApi } from '../api/teams';
import { MatchRow } from '../components/match/MatchRow';
import { StandingsTable } from '../components/standings/StandingsTable';
import { LeaderCard } from '../components/stats/LeaderCard';
import { Avatar } from '../components/common/Avatar';
import { LoadingState, ErrorState, StatTile } from '../components/common/Common';
import { useLiveSocket } from '../hooks/useLiveSocket';

export function HomePage() {
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [leaderboards, setLeaderboards] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const [tData, tmData, mData, sData, lData] = await Promise.all([
        tournamentApi.getTournament().catch(() => null),
        teamsApi.getTeams().catch(() => []),
        matchesApi.getMatches().catch(() => []),
        standingsApi.getStandings().catch(() => []),
        statisticsApi.getLeaderboards().catch(() => null),
      ]);
      setTournament(tData);
      setTeams(tmData || []);
      setMatches(mData || []);
      setStandings(sData || []);
      setLeaderboards(lData);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load tournament data');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, []);

  useLiveSocket(() => {
    loadData(false);
  });

  if (loading) return <LoadingState message="Loading DCL Season 5..." />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  const liveMatches = matches.filter((m) => m.status === 'live');
  const upcomingMatches = matches.filter((m) => m.status === 'upcoming');
  const completedMatches = matches.filter((m) => m.status === 'full_time' || m.status === 'completed');

  const nextMatch = upcomingMatches[0] || null;
  const latestResult = completedMatches.length > 0 ? completedMatches[completedMatches.length - 1] : null;

  const getTeamLogo = (name, logoUrl) =>
    logoUrl || (name && name !== 'TBD' ? `/assets/teams/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.png` : null);

  return (
    <div>
      {/* Live Match Alert Banner */}
      {liveMatches.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div className="section-title">
            <h2 style={{ color: 'var(--green)' }}>
              <Activity size={22} className="pulse-live" /> LIVE NOW
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {liveMatches.map((m) => (
              <MatchRow key={m.id} match={m} showVenue />
            ))}
          </div>
        </div>
      )}

      {/* Featured Cards: Next Upcoming Match & Latest Result */}
      {(nextMatch || latestResult) && (
        <div className="grid-2" style={{ marginBottom: '24px', gap: '16px' }}>
          {/* Next Match Card */}
          {nextMatch ? (
            <div
              className="card"
              onClick={() => navigate(`/matches/${nextMatch.id}`)}
              style={{ cursor: 'pointer', borderLeft: '4px solid var(--amber)', padding: '18px 20px', transition: 'border-color 0.15s' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--amber)' }}>
                  Next Match &bull; #{nextMatch.match_number}
                </span>
                <span className="pill pill-upcoming" style={{ fontSize: '11px' }}>Upcoming</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <Avatar name={nextMatch.team1_name || 'TBD'} photoUrl={getTeamLogo(nextMatch.team1_name, nextMatch.team1_logo)} size={32} color="#f0a53d" />
                  <span style={{ fontWeight: 600, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextMatch.team1_name || 'TBD'}</span>
                </div>
                <div style={{ color: 'var(--chalk-muted)', fontWeight: 700, fontSize: '13px', padding: '0 8px', flexShrink: 0 }}>VS</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
                  <span style={{ fontWeight: 600, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextMatch.team2_name || 'TBD'}</span>
                  <Avatar name={nextMatch.team2_name || 'TBD'} photoUrl={getTeamLogo(nextMatch.team2_name, nextMatch.team2_logo)} size={32} color="#3ecf6e" />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--chalk-dim)', borderTop: '1px solid var(--line)', paddingTop: '10px', flexWrap: 'wrap' }}>
                {nextMatch.date && <span><Calendar size={12} style={{ display: 'inline', marginRight: '4px' }} />{nextMatch.date}</span>}
                {nextMatch.time && <span><Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />{nextMatch.time}</span>}
                {nextMatch.venue && <span><MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />{nextMatch.venue}</span>}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--chalk-muted)' }}>
              No upcoming fixtures scheduled
            </div>
          )}

          {/* Latest Result Card */}
          {latestResult ? (
            <div
              className="card"
              onClick={() => navigate(`/matches/${latestResult.id}`)}
              style={{ cursor: 'pointer', borderLeft: '4px solid var(--green)', padding: '18px 20px', transition: 'border-color 0.15s' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--green)' }}>
                  Latest Result &bull; #{latestResult.match_number}
                </span>
                <span className="pill pill-full-time" style={{ fontSize: '11px' }}>Full Time</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <Avatar name={latestResult.team1_name} photoUrl={getTeamLogo(latestResult.team1_name, latestResult.team1_logo)} size={32} color="#f0a53d" />
                  <span style={{ fontWeight: latestResult.winner_id === latestResult.team1_id ? 700 : 500, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {latestResult.team1_name}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', padding: '0 8px', color: 'var(--chalk)', flexShrink: 0 }}>
                  {latestResult.score1} &ndash; {latestResult.score2}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
                  <span style={{ fontWeight: latestResult.winner_id === latestResult.team2_id ? 700 : 500, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {latestResult.team2_name}
                  </span>
                  <Avatar name={latestResult.team2_name} photoUrl={getTeamLogo(latestResult.team2_name, latestResult.team2_logo)} size={32} color="#3ecf6e" />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--chalk-dim)', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
                <span>{latestResult.date} &bull; {latestResult.venue || 'Stadium'}</span>
                <span style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Details <ArrowRight size={12} />
                </span>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--chalk-muted)' }}>
              No completed matches yet
            </div>
          )}
        </div>
      )}

      {/* Tournament Overview Stats */}
      <div className="stat-grid" style={{ marginBottom: '28px' }}>
        <StatTile label="Stage" value={tournament?.stage?.toUpperCase() || 'GROUP'} />
        <StatTile label="Teams" value={teams.length} />
        <StatTile label="Matches Total" value={matches.length} />
        <StatTile label="Completed" value={completedMatches.length} />
        <StatTile label="Upcoming" value={upcomingMatches.length} />
        <StatTile label="Top Scorer" value={leaderboards?.top_scorers?.[0]?.player_name || '-'} />
      </div>

      {/* Standings & Matches Grid */}
      <div className="grid-2" style={{ marginBottom: '32px' }}>
        {/* Left: Standings */}
        <div>
          <div className="section-title">
            <h2>Group Standings</h2>
            <NavLink to="/standings" style={{ fontSize: '13px', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Full tables <ArrowRight size={14} />
            </NavLink>
          </div>
          {standings.map((grp) => (
            <StandingsTable
              key={grp.group_id}
              groupName={grp.group_name}
              standings={grp.standings}
              showLegend={false}
            />
          ))}
        </div>

        {/* Right: Matches & Scorers */}
        <div>
          <div className="section-title">
            <h2>Recent & Upcoming Fixtures</h2>
            <NavLink to="/matches" style={{ fontSize: '13px', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              All matches <ArrowRight size={14} />
            </NavLink>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            {matches.slice(0, 4).map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>

          {/* Top Scorers & Top Assists preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="section-title">
              <h2>Tournament Leaders</h2>
              <NavLink to="/stats" style={{ fontSize: '13px', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                All leaderboards <ArrowRight size={14} />
              </NavLink>
            </div>
            <div className="grid-2" style={{ gap: '14px' }}>
              <LeaderCard
                title="Golden Boot"
                icon={Flame}
                unit="goals"
                items={leaderboards?.top_scorers || []}
                limit={5}
              />
              <LeaderCard
                title="Top Playmakers"
                icon={Users}
                unit="assists"
                items={leaderboards?.top_assists || []}
                limit={5}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
