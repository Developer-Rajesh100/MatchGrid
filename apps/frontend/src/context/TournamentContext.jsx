import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { tournamentApi } from '../api/tournament';
import { useLiveSocket } from '../hooks/useLiveSocket';

const TournamentContext = createContext({
  tournament: null,
  tournamentId: null,
  slug: null,
  loading: false,
  error: null,
  refreshTournament: () => {},
});

export function TournamentProvider({ children, slugOverride = null }) {
  let routeParams = {};
  try {
    routeParams = useParams();
  } catch {
    // outside router
  }
  const location = useLocation();
  const pathSlug = location?.pathname ? location.pathname.match(/\/t\/([^/]+)/)?.[1] || null : null;
  const slug = slugOverride || routeParams?.slug || pathSlug;

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState(null);

  const fetchTournament = useCallback(async (showLoading = true) => {
    if (!slug) return;
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await tournamentApi.getTournamentBySlug(slug);
      setTournament(data);
    } catch (err) {
      if (showLoading) setError(err.message || 'Tournament not found');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (slug) {
      fetchTournament(true);
    } else {
      setTournament(null);
      setLoading(false);
    }
  }, [slug, fetchTournament]);

  // Connect live socket scoped to tournament ID
  useLiveSocket(
    useCallback(() => {
      fetchTournament(false);
    }, [fetchTournament]),
    tournament?.id || null
  );

  const value = {
    tournament,
    tournamentId: tournament?.id || null,
    slug: tournament?.slug || slug || null,
    loading,
    error,
    refreshTournament: () => fetchTournament(false),
  };

  return (
    <TournamentContext.Provider value={value}>
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournament() {
  return useContext(TournamentContext);
}

export default TournamentContext;
