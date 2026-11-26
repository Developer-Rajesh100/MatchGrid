import React from 'react';
import { Shuffle, Calendar, GitBranch, Edit2 } from 'lucide-react';
import { StatusPill } from '../../../components/common/StatusPill';
import { formatWhen } from '../../../utils/dates';
import { stageLabel } from '../../../utils/matchLabels';

export function FixturesDrawTab({ ws }) {
  const { groups, matches, handleRandomDraw, handleGenerateFixtures, handleSeedKnockout, openScheduleModal, tabLoading } = ws;

  return (
    <div data-testid="organizer-fixtures-panel" className="ow-stack" aria-busy={tabLoading}>
      <section className="ow-card ow-engine">
        <div>
          <h3 className="ow-h">Tournament Engine Operations</h3>
          <p className="ow-muted">Execute dynamic draws, fixture schedules, and bracket seeding</p>
        </div>
        <div className="ow-engine__buttons">
          <button onClick={handleRandomDraw} disabled={tabLoading} className="btn btn-sm btn-outline" data-testid="random-draw-btn">
            <Shuffle size={13} aria-hidden="true" /> Random Group Draw
          </button>
          <button onClick={handleGenerateFixtures} disabled={tabLoading} className="btn btn-sm btn-outline" data-testid="generate-fixtures-btn">
            <Calendar size={13} aria-hidden="true" /> Generate Group Fixtures
          </button>
          <button onClick={handleSeedKnockout} disabled={tabLoading} className="btn btn-sm btn-primary" data-testid="seed-knockout-btn">
            <GitBranch size={13} aria-hidden="true" /> Seed Knockout Bracket
          </button>
        </div>
      </section>

      {groups && groups.length > 0 && (
        <section>
          <h3 className="ow-h ow-h--section">Group Allocations <span className="num ow-count">{groups.length}</span></h3>
          <div className="ow-groups">
            {groups.map((group) => (
              <div key={group.id} data-testid={`group-card-${group.name}`} className="ow-card ow-group">
                <div className="ow-group__title">Group {group.name}</div>
                {group.teams && group.teams.length > 0 ? (
                  <ul className="ow-group__teams">
                    {group.teams.map((t) => (
                      <li key={t.id || t.team_id} style={{ '--team-color': t.color || '#64748B' }}>{t.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="ow-muted">No teams drawn yet. Click "Random Group Draw".</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="ow-card">
        <div className="ow-card__head">
          <h3 className="ow-h">Competition Fixtures <span className="num ow-count">{matches.length}</span></h3>
        </div>

        {matches.length === 0 ? (
          <p className="ow-empty">No fixtures scheduled yet. Use "Generate Group Fixtures" to schedule group matches.</p>
        ) : (
          <ul className="ow-list">
            {matches.map((m) => (
              <li key={m.id} data-testid={`match-row-${m.id}`} className="ow-fixture">
                <span className="ow-fixture__no num">#{m.match_number}</span>
                <span className="ow-fixture__body">
                  <span className="ow-fixture__teams">
                    <span className="ow-fixture__team" style={{ '--team-color': m.team1_color || '#64748B' }}>{m.team1_name || 'TBD'}</span>
                    <span className="ow-vs">VS</span>
                    <span className="ow-fixture__team" style={{ '--team-color': m.team2_color || '#64748B' }}>{m.team2_name || 'TBD'}</span>
                  </span>
                  <span className="ow-muted ow-fixture__meta">
                    {[stageLabel(m) || m.stage, m.date ? formatWhen(m.date, m.time) : 'Unscheduled', m.venue].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <StatusPill status={m.status} isHalfTime={m.is_half_time} />
                <button onClick={() => openScheduleModal(m)} className="btn btn-sm btn-outline" data-testid={`edit-match-schedule-${m.id}`}>
                  <Edit2 size={12} aria-hidden="true" /> Schedule
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default FixturesDrawTab;
