import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

const KNOCKOUT_NAMES = { semis_final: 'Semi-finals & final', quarters_semis_final: 'Quarters, semis & final', none: 'League only' };

/** Read-only rules of the competition, with the destructive action kept apart from the daily workflow. */
export function TournamentSettingsTab({ ws }) {
  const { activeTournament: t, openDeleteModal } = ws;
  const c = t.config || {};
  const rows = [
    ['Slug', t.slug],
    ['Season', t.season],
    ['Groups', `${c.num_groups ?? 2} groups`],
    ['Teams per group', c.teams_per_group ?? '—'],
    ['Qualifiers per group', c.qualifiers_per_group ?? 2],
    ['Knockout format', KNOCKOUT_NAMES[c.knockout_format] || c.knockout_format || 'semis_final'],
    ['Points (W / D / L)', `${c.points_win ?? 3} / ${c.points_draw ?? 1} / ${c.points_loss ?? 0}`],
    ['Half duration', `${c.match_duration_half_minutes ?? 20} min`],
  ];

  return (
    <div data-testid="organizer-settings-panel" className="ow-stack">
      <section className="ow-card">
        <h3 className="ow-h">Tournament Configuration</h3>
        <dl className="ow-config">
          {rows.map(([k, v]) => (
            <div key={k} className="ow-config__item">
              <dt>{k}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ow-card ow-danger" aria-labelledby="ow-danger-h">
        <div className="ow-danger__head">
          <AlertTriangle size={20} aria-hidden="true" />
          <h3 id="ow-danger-h" className="ow-h">Danger Zone: Delete Tournament</h3>
        </div>
        <p className="ow-muted ow-danger__text">
          Permanently delete competition <strong>{t.name}</strong> along with all associated teams, players, fixtures, and standings. This action cannot be reversed.
        </p>
        <button onClick={openDeleteModal} className="btn btn-danger" data-testid="delete-tournament-btn">
          <Trash2 size={14} aria-hidden="true" /> Delete This Competition
        </button>
      </section>
    </div>
  );
}

export default TournamentSettingsTab;
