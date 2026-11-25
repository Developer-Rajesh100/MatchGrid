import React from 'react';
import { Trash2, UserCheck, UserPlus, X } from 'lucide-react';

export function ScorersStaffTab({ ws }) {
  const { scorers, matches, setDialog, handleDeleteScorer, openAssignModal, handleUnassignScorer } = ws;

  return (
    <div data-testid="organizer-scorers-panel" className="ow-split">
      <section className="ow-card ow-clubs">
        <div className="ow-card__head">
          <h3 className="ow-h">Scorer Roster <span className="num ow-count">{scorers.length}</span></h3>
          <button onClick={() => setDialog('scorer')} className="btn btn-sm btn-primary" data-testid="create-scorer-btn">
            <UserPlus size={13} aria-hidden="true" /> Provision Scorer
          </button>
        </div>

        {scorers.length === 0 ? (
          <p className="ow-empty">No scorers provisioned yet. Click "Provision Scorer" to create matchday operator credentials.</p>
        ) : (
          <ul className="ow-list">
            {scorers.map((s) => (
              <li key={s.id} data-testid={`scorer-card-${s.id}`} className="ow-scorer">
                <span className="ow-scorer__icon"><UserCheck size={15} aria-hidden="true" /></span>
                <span className="ow-club__text">
                  <span className="ow-club__name">{s.username}</span>
                  <span className="ow-muted">{s.role}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteScorer(s.id, s.username)}
                  className="ow-icon-btn"
                  data-testid={`delete-scorer-btn-${s.id}`}
                  title="Delete Scorer"
                  aria-label={`Delete scorer ${s.username}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ow-card">
        <h3 className="ow-h">Match Scorer Assignments</h3>
        {matches.length === 0 ? (
          <p className="ow-empty">No matches available to assign. Generate fixtures first.</p>
        ) : (
          <ul className="ow-list">
            {matches.map((m) => {
              const assigned = m.assigned_scorer_ids || [];
              return (
                <li key={m.id} data-testid={`match-scorer-row-${m.id}`} className="ow-assign">
                  <span className="ow-fixture__no num">#{m.match_number}</span>
                  <span className="ow-assign__body">
                    <span className="ow-assign__fixture">{m.team1_name || 'TBD'} vs {m.team2_name || 'TBD'}</span>
                    {assigned.length === 0 ? (
                      <span className="ow-muted">No scorer assigned</span>
                    ) : (
                      <span className="ow-chips">
                        {assigned.map((sid) => {
                          const obj = scorers.find((s) => s.id === sid);
                          return (
                            <span key={sid} data-testid={`assigned-scorer-chip-${sid}`} className="ow-chip">
                              {obj ? obj.username : sid}
                              <button type="button" onClick={() => handleUnassignScorer(m.id, sid)} title="Unassign" aria-label={`Unassign ${obj ? obj.username : sid}`}>
                                <X size={12} aria-hidden="true" />
                              </button>
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </span>
                  <button onClick={() => openAssignModal(m)} className="btn btn-sm btn-outline" data-testid={`assign-scorer-btn-${m.id}`}>
                    + Assign
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default ScorersStaffTab;
