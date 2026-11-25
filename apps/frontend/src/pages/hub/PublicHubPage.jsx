import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Trophy, Radio } from 'lucide-react';
import { tournamentApi } from '../../api/tournament';
import { matchesApi } from '../../api/matches';
import { TournamentCard } from '../../components/hub/TournamentCard';
import { LiveNowStrip } from '../../components/hub/LiveNowStrip';
import { ErrorState } from '../../components/common/Common';
import { Skeleton } from '../../components/common/Skeleton';
import { useLiveSocket } from '../../hooks/useLiveSocket';
import { clockOffsetMs } from '../../utils/clock';

const isLive = (t) => (t.live_matches_count || 0) > 0 || (t.status || '').toUpperCase() === 'LIVE';

function HubSkeleton() {
  return (
    <div className="public-hub-page" role="status" aria-live="polite">
      <span className="sr-only">Loading Tournament Hub...</span>
      <div className="hub-head">
        <h1>MatchGrid Tournament Hub</h1>
      </div>
      <div className="directory" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="directory-row directory-row--skeleton">
            <Skeleton width={44} height={44} />
            <Skeleton width="45%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PublicHubPage() {
  const [tournaments, setTournaments] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // ALL | LIVE | UPCOMING | COMPLETED
  const loadedOnce = useRef(false);

  const loadAll = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const [data, live] = await Promise.all([
        tournamentApi.getPublicTournaments(),
        // the strip is a bonus: the directory must still render if it fails
        matchesApi.getFeaturedLive(8).catch(() => []),
      ]);
      setTournaments(Array.isArray(data) ? data : []);
      const liveList = Array.isArray(live) ? live : [];
      setFeatured(liveList);
      setClockOffset(clockOffsetMs(liveList[0], Date.now()));
      loadedOnce.current = true;
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load public competitions');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(true);
  }, [loadAll]);

  // Quiet refresh on live status changes, and a gentle poll while anything is in play (goals are
  // room-scoped, so the hub would otherwise show stale scores between status changes).
  useLiveSocket(useCallback(() => { loadAll(false); }, [loadAll]));
  const anyLive = featured.length > 0;
  useEffect(() => {
    if (!anyLive) return undefined;
    const id = setInterval(() => loadAll(false), 30000);
    return () => clearInterval(id);
  }, [anyLive, loadAll]);

  const liveTournaments = useMemo(() => tournaments.filter(isLive), [tournaments]);
  const upcoming = useMemo(() => tournaments.filter((t) => (t.status || '').toUpperCase() === 'DRAFT'), [tournaments]);
  const completed = useMemo(() => tournaments.filter((t) => (t.status || '').toUpperCase() === 'COMPLETED'), [tournaments]);
  const liveMatchTotal = useMemo(
    () => tournaments.reduce((n, t) => n + (t.live_matches_count || 0), 0),
    [tournaments]
  );

  const filteredTournaments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tournaments.filter((t) => {
      if (activeFilter === 'LIVE' && !isLive(t)) return false;
      if (activeFilter === 'UPCOMING' && (t.status || '').toUpperCase() !== 'DRAFT') return false;
      if (activeFilter === 'COMPLETED' && (t.status || '').toUpperCase() !== 'COMPLETED') return false;
      if (!q) return true;
      return [t.name, t.season, t.organizer_name].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [tournaments, activeFilter, searchQuery]);

  if (loading && !loadedOnce.current) return <HubSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => loadAll(true)} />;

  const tabs = [
    { id: 'ALL', label: `All (${tournaments.length})` },
    { id: 'LIVE', label: `Live (${liveTournaments.length})`, icon: true },
    { id: 'UPCOMING', label: `Upcoming (${upcoming.length})` },
    { id: 'COMPLETED', label: `Completed (${completed.length})` },
  ];

  return (
    <div className="public-hub-page">
      <div className="hub-head">
        <h1>MatchGrid Tournament Hub</h1>
        <p>Live scores, tables and brackets for every competition on the platform.</p>
      </div>

      <LiveNowStrip
        matches={featured}
        liveCount={liveMatchTotal || featured.length}
        tournamentCount={liveTournaments.length}
        offsetMs={clockOffset}
      />

      <div className="hub-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Filter competitions">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === tab.id}
              className={`filter-tab ${activeFilter === tab.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(tab.id)}
            >
              {tab.icon && <Radio size={12} aria-hidden="true" />}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="hub-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="input-field"
            placeholder="Search competitions..."
            aria-label="Search competitions"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {filteredTournaments.length === 0 ? (
        <div className="empty-block">
          <Trophy size={30} aria-hidden="true" />
          {searchQuery ? (
            <>
              <h3>No tournaments matching &ldquo;{searchQuery}&rdquo;</h3>
              <p>Try a different search, or switch the filter.</p>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setSearchQuery('')}>
                Clear search
              </button>
            </>
          ) : (
            <>
              <h3>No competitions in this category yet</h3>
              <p>Check back soon, or look under another filter.</p>
            </>
          )}
        </div>
      ) : (
        <div className="directory">
          <div className="directory-head" aria-hidden="true">
            <span>Competition</span>
            <span>Status</span>
            <span className="directory-head__facts">
              <span>Stage</span>
              <span className="num">Clubs</span>
              <span className="num">Matches</span>
              <span className="num">Live</span>
            </span>
          </div>
          {filteredTournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export default PublicHubPage;
