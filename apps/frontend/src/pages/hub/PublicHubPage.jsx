import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Trophy, Radio, Calendar, CheckCircle2, RefreshCw } from 'lucide-react';
import { tournamentApi } from '../../api/tournament';
import { TournamentCard } from '../../components/hub/TournamentCard';
import { LiveSpotlightBanner } from '../../components/hub/LiveSpotlightBanner';
import { LoadingState, ErrorState } from '../../components/common/Common';
import { useLiveSocket } from '../../hooks/useLiveSocket';

export function PublicHubPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // ALL | LIVE | UPCOMING | COMPLETED

  const loadTournaments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await tournamentApi.getPublicTournaments();
      setTournaments(Array.isArray(data) ? data : []);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load public competitions');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments(true);
  }, [loadTournaments]);

  useLiveSocket(
    useCallback(() => {
      loadTournaments(false);
    }, [loadTournaments])
  );

  const liveTournaments = useMemo(() => {
    return tournaments.filter(
      (t) => (t.live_matches_count || 0) > 0 || (t.status || '').toUpperCase() === 'LIVE'
    );
  }, [tournaments]);

  const upcomingTournaments = useMemo(() => {
    return tournaments.filter((t) => (t.status || '').toUpperCase() === 'DRAFT');
  }, [tournaments]);

  const completedTournaments = useMemo(() => {
    return tournaments.filter((t) => (t.status || '').toUpperCase() === 'COMPLETED');
  }, [tournaments]);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      // 1. Tab filter
      if (activeFilter === 'LIVE') {
        const isLive = (t.live_matches_count || 0) > 0 || (t.status || '').toUpperCase() === 'LIVE';
        if (!isLive) return false;
      } else if (activeFilter === 'UPCOMING') {
        if ((t.status || '').toUpperCase() !== 'DRAFT') return false;
      } else if (activeFilter === 'COMPLETED') {
        if ((t.status || '').toUpperCase() !== 'COMPLETED') return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (t.name || '').toLowerCase().includes(q);
        const seasonMatch = (t.season || '').toLowerCase().includes(q);
        const orgMatch = (t.organizer_name || '').toLowerCase().includes(q);
        return nameMatch || seasonMatch || orgMatch;
      }

      return true;
    });
  }, [tournaments, activeFilter, searchQuery]);

  if (loading) {
    return <LoadingState message="Loading Tournament Hub..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => loadTournaments(true)} />;
  }

  return (
    <div className="public-hub-page">
      {/* Hero Header */}
      <div className="hub-hero" style={{ marginBottom: '28px', textAlign: 'center' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '32px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.5px',
            marginBottom: '8px',
          }}
        >
          MatchGrid Tournament Hub
        </h1>
        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            maxWidth: '640px',
            margin: '0 auto',
            lineHeight: 1.5,
          }}
        >
          Discover live competitions, visual brackets, group tables, and tournament centers across all sports leagues.
        </p>
      </div>

      {/* Live Spotlight Banner if live matches underway */}
      <LiveSpotlightBanner liveTournaments={liveTournaments} />

      {/* Directory Filter & Search Toolbar */}
      <div
        className="hub-toolbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '24px',
        }}
      >
        {/* Status Filter Tabs */}
        <div className="filter-tabs" role="tablist" style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'ALL'}
            className={`filter-tab ${activeFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ALL')}
          >
            All ({tournaments.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'LIVE'}
            className={`filter-tab ${activeFilter === 'LIVE' ? 'active' : ''}`}
            onClick={() => setActiveFilter('LIVE')}
          >
            <Radio size={12} className="pulse-icon" style={{ display: 'inline', marginRight: '4px' }} />
            Live ({liveTournaments.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'UPCOMING'}
            className={`filter-tab ${activeFilter === 'UPCOMING' ? 'active' : ''}`}
            onClick={() => setActiveFilter('UPCOMING')}
          >
            Upcoming ({upcomingTournaments.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'COMPLETED'}
            className={`filter-tab ${activeFilter === 'COMPLETED' ? 'active' : ''}`}
            onClick={() => setActiveFilter('COMPLETED')}
          >
            Completed ({completedTournaments.length})
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="input-field"
            placeholder="Search competitions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px', height: '38px', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Tournaments Grid */}
      {filteredTournaments.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Trophy size={36} style={{ opacity: 0.4 }} />
          {searchQuery ? (
            <>
              <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>
                No tournaments matching &ldquo;{searchQuery}&rdquo;
              </h3>
              <p style={{ fontSize: '13px', margin: 0 }}>
                Try adjusting your search query or switching filter tabs.
              </p>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </button>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>
                No competitions found in this category
              </h3>
              <p style={{ fontSize: '13px', margin: 0 }}>
                Check back soon or explore other filter categories.
              </p>
            </>
          )}
        </div>
      ) : (
        <div
          className="hub-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredTournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </div>
  );
}

export default PublicHubPage;
