import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Avatar } from '../../../components/common/Avatar';
import { SkeletonRows } from '../../../components/common/Skeleton';

export function TeamsSquadsTab({ ws }) {
  const { teams, selectedTeam, selectedTeamId, setSelectedTeamId, players, setDialog, handleDeleteClub, handleDeletePlayer, tabLoading } = ws;

  return (
    <div data-testid="organizer-teams-panel" className="ow-split">
      <section className="ow-card ow-clubs">
        <div className="ow-card__head">
          <h2 className="ow-h">Participating Clubs <span className="num ow-count">{teams.length}</span></h2>
          <button onClick={() => setDialog('club')} className="btn btn-sm btn-primary" data-testid="add-club-btn">
            <Plus size={13} aria-hidden="true" /> Add Club
          </button>
        </div>

        {tabLoading && teams.length === 0 ? (
          <SkeletonRows rows={4} height={52} label="Loading clubs" />
        ) : teams.length === 0 ? (
          <p className="ow-empty">No clubs registered yet. Add clubs to this tournament.</p>
        ) : (
          <ul className="ow-list">
            {teams.map((team) => {
              const selected = team.id === selectedTeamId;
              return (
                <li key={team.id} className="ow-list__item">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    data-testid={`club-item-${team.id}`}
                    className={`ow-club ${selected ? 'is-on' : ''}`}
                    style={{ '--team-color': team.color || '#64748B' }}
                    onClick={() => setSelectedTeamId(team.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTeamId(team.id);
                      }
                    }}
                  >
                    <Avatar name={team.name} crestUrl={team.crest_url || team.logo_url} color={team.color || '#10B981'} size={32} />
                    <span className="ow-club__text">
                      <span className="ow-club__name">{team.name}</span>
                      <span className="ow-muted"><span className="num">{team.player_count ?? 0}</span> players</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClub(team.id, team.name);
                      }}
                      className="ow-icon-btn"
                      data-testid={`delete-club-btn-${team.id}`}
                      title="Delete Club"
                      aria-label={`Delete club ${team.name}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ow-card ow-roster">
        {selectedTeam ? (
          <>
            <div className="ow-card__head ow-roster__head" style={{ '--team-color': selectedTeam.color || '#64748B' }}>
              <div className="ow-roster__title">
                <Avatar name={selectedTeam.name} crestUrl={selectedTeam.crest_url || selectedTeam.logo_url} color={selectedTeam.color || '#10B981'} size={40} />
                <div>
                  <h2 className="ow-h">{selectedTeam.name} Roster</h2>
                  <p className="ow-muted">Club squad members and official matchday roster</p>
                </div>
              </div>
              <button onClick={() => setDialog('player')} className="btn btn-sm btn-primary" data-testid="add-player-btn">
                <Plus size={13} aria-hidden="true" /> Add Player
              </button>
            </div>

            {players.length === 0 ? (
              <p className="ow-empty">No players registered for {selectedTeam.name} yet. Click "+ Add Player" to enroll athletes.</p>
            ) : (
              <ul className="ow-list">
                {players.map((p) => (
                  <li key={p.id} data-testid={`player-row-${p.id}`} className="ow-player">
                    <span className="ow-player__no num">{p.number ?? '-'}</span>
                    <Avatar name={p.name} crestUrl={p.photo_url} size={28} />
                    <span className="ow-player__name">{p.name}</span>
                    {p.is_manager ? <span className="ow-tag ow-tag--gold">Manager</span> : <span className="ow-muted ow-player__role">Squad Player</span>}
                    <button
                      type="button"
                      onClick={() => handleDeletePlayer(p.id, p.name)}
                      className="ow-icon-btn"
                      data-testid={`delete-player-btn-${p.id}`}
                      title="Remove Player"
                      aria-label={`Remove player ${p.name}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="ow-empty">Select a club from the left to view and manage its squad roster.</p>
        )}
      </section>
    </div>
  );
}

export default TeamsSquadsTab;
