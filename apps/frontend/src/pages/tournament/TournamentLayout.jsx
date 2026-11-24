import React from 'react';
import { Outlet, useParams, Link } from 'react-router-dom';
import { TournamentProvider, useTournament } from '../../context/TournamentContext';
import { TournamentSubNav } from '../../components/nav/TournamentSubNav';
import { LoadingState, ErrorState } from '../../components/common/Common';

function TournamentShellContent() {
  const { tournament, loading, error } = useTournament();

  if (loading) {
    return <LoadingState message="Loading Tournament Center..." />;
  }

  if (error || !tournament) {
    return (
      <div style={{ padding: '40px 16px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <ErrorState message={error || 'Tournament not found'} />
        <div style={{ marginTop: '20px' }}>
          <Link to="/" className="btn btn-primary">
            Return to Tournament Hub
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tournament-shell">
      <TournamentSubNav />
      <div className="tournament-content" style={{ marginTop: '24px' }}>
        <Outlet />
      </div>
    </div>
  );
}

export function TournamentLayout() {
  const { slug } = useParams();

  return (
    <TournamentProvider key={slug}>
      <TournamentShellContent />
    </TournamentProvider>
  );
}

export default TournamentLayout;
