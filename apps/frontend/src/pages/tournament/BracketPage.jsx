import React, { useState, useCallback } from 'react';
import { GitFork, Trophy, RefreshCw } from 'lucide-react';
import { useTournament } from '../../context/TournamentContext';
import TournamentBracket from '../../components/bracket/TournamentBracket';
import { useLiveSocket } from '../../hooks/useLiveSocket';

export function BracketPage() {
  const { tournament, tournamentId } = useTournament();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useLiveSocket(handleRefresh, tournamentId);

  return (
    <div className="tournament-bracket-page">
      <div
        className="section-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <GitFork size={20} style={{ color: 'var(--brand-primary)' }} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
              Knockout Stage & Bracket Tree
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Single-elimination progression &bull; Live scores &bull; Penalty deciders (P) &bull; Champion honors
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="btn btn-sm btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={12} /> Refresh Bracket
        </button>
      </div>

      <TournamentBracket tournamentId={tournamentId} refreshTrigger={refreshTrigger} />
    </div>
  );
}

export default BracketPage;
