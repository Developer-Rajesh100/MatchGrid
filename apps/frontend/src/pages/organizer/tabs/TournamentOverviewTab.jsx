import React from 'react';
import { ArrowRight, CheckCircle2, Circle, ExternalLink, Users, Calendar, Activity } from 'lucide-react';
import { StatusPill } from '../../../components/common/StatusPill';
import { TeamMark } from '../../../components/common/TeamMark';
import { formatWhen } from '../../../utils/dates';
import { stageLabel } from '../../../utils/matchLabels';
import { NavLink } from 'react-router-dom';

const STAGE_NAMES = { group: 'Group stage', quarters: 'Quarter-finals', semis: 'Semi-finals', final: 'Final', champions: 'Completed' };
const KNOCKOUT_NAMES = { semis_final: 'Semi-finals & final', quarters_semis_final: 'Quarters, semis & final', none: 'League only' };

/** Where the competition stands and what to do next. Everything here is derived from data the workspace already loaded. */
export function TournamentOverviewTab({ ws }) {
  const { activeTournament: t, teams, groups, matches, scorers, setTab } = ws;
  const played = matches.filter((m) => m.status === 'full_time' || m.status === 'completed');
  const live = matches.filter((m) => m.status === 'live');
  const upcoming = matches
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => `${a.date || '9999'}${a.time || ''}`.localeCompare(`${b.date || '9999'}${b.time || ''}`));
  const pct = matches.length ? Math.round((played.length / matches.length) * 100) : 0;
  const unscorered = matches.filter((m) => m.status !== 'full_time' && !(m.assigned_scorer_ids || []).length).length;
  const drawn = groups.some((g) => (g.teams || []).length > 0);
  const hasKnockout = t.config?.knockout_format && t.config.knockout_format !== 'none';
  const knockoutSeeded = matches.some((m) => m.stage && m.stage !== 'group' && m.stage !== 'extra');

  const steps = [
    { done: teams.length > 0, label: 'Register clubs and squads', hint: `${teams.length} club${teams.length === 1 ? '' : 's'} registered`, tab: 'teams' },
    { done: drawn, label: 'Draw the groups', hint: drawn ? `${groups.length} groups drawn` : 'Not drawn yet', tab: 'fixtures' },
    { done: matches.length > 0, label: 'Generate the group fixtures', hint: `${matches.length} fixtures`, tab: 'fixtures' },
    { done: scorers.length > 0 && unscorered === 0 && matches.length > 0, label: 'Assign a scorer to every match', hint: matches.length ? `${unscorered} without a scorer` : 'After fixtures exist', tab: 'scorers' },
    ...(hasKnockout ? [{ done: knockoutSeeded, label: 'Seed the knockout bracket', hint: knockoutSeeded ? 'Bracket seeded' : 'After the group stage', tab: 'fixtures' }] : []),
  ];
  const next = steps.find((s) => !s.done);

  return (
    <div data-testid="organizer-overview-panel" className="ow-stack">
      <section className="ow-card ow-summary">
        <div className="ow-summary__main">
          <div className="ow-summary__tags">
            <span className={`ow-tag ow-tag--${t.status === 'active' ? 'on' : 'off'}`}>{t.status || 'draft'}</span>
            <span className="ow-tag">{STAGE_NAMES[t.stage] || 'Group stage'}</span>
            <span className="ow-tag ow-tag--plain">{KNOCKOUT_NAMES[t.config?.knockout_format] || 'Semi-finals & final'}</span>
          </div>
          <h2 className="ow-summary__name">{t.name}</h2>
          <p className="ow-muted">Season <span className="num">{t.season}</span> · /t/{t.slug}</p>
        </div>
        <div className="ow-summary__actions">
          <NavLink to={`/t/${t.slug}`} target="_blank" className="btn btn-outline btn-sm">
            <ExternalLink size={14} aria-hidden="true" /> View public page
          </NavLink>
        </div>
      </section>

      <dl className="facts ow-facts">
        {[
          ['Clubs', teams.length],
          ['Groups', groups.length],
          ['Fixtures', matches.length],
          ['Played', played.length],
          ['Live now', live.length],
          ['Scorers', scorers.length],
        ].map(([label, value]) => (
          <div className="facts__item" key={label}>
            <dt>{label}</dt>
            <dd className="num">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="ow-cols">
        <section className="ow-card">
          <h3 className="ow-h">Quick actions</h3>
          <div className="ow-actions">
            <button type="button" className="ow-action" onClick={() => setTab('teams')}>
              <Users size={18} aria-hidden="true" /><span><strong>Teams &amp; squads</strong><small>Add clubs and players</small></span><ArrowRight size={14} aria-hidden="true" />
            </button>
            <button type="button" className="ow-action" onClick={() => setTab('fixtures')}>
              <Calendar size={18} aria-hidden="true" /><span><strong>Fixtures &amp; draw</strong><small>Draw, schedule, seed</small></span><ArrowRight size={14} aria-hidden="true" />
            </button>
            <button type="button" className="ow-action" onClick={() => setTab('scorers')}>
              <Activity size={18} aria-hidden="true" /><span><strong>Scorers &amp; staff</strong><small>Provision and assign</small></span><ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className="ow-card">
          <h3 className="ow-h">Setup checklist</h3>
          <ol className="ow-steps">
            {steps.map((s) => (
              <li key={s.label} className={`ow-step ${s.done ? 'is-done' : ''} ${s === next ? 'is-next' : ''}`}>
                {s.done ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                <span className="ow-step__text">
                  <span className="ow-step__label">{s.label}</span>
                  <span className="ow-muted">{s.hint}</span>
                </span>
                {s === next && (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setTab(s.tab)}>Go</button>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="ow-card" aria-label="Competition progress">
        <div className="ow-progress__head">
          <h3 className="ow-h">Live progress</h3>
          <span className="ow-muted"><span className="num">{played.length}</span> of <span className="num">{matches.length}</span> fixtures played</span>
        </div>
        <div className="ow-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Fixtures played">
          <span style={{ width: `${pct}%` }} />
        </div>

        {live.length > 0 && (
          <ul className="ow-list" aria-label="Matches in play">
            {live.map((m) => (
              <li key={m.id} className="ow-row ow-row--live">
                <span className="num ow-row__no">#{m.match_number}</span>
                <span className="ow-row__teams">
                  <TeamMark name={m.team1_name} color={m.team1_color} size={22} />
                  <span className="ow-vs num">{m.score1 ?? 0}–{m.score2 ?? 0}</span>
                  <TeamMark name={m.team2_name} color={m.team2_color} size={22} />
                </span>
                <StatusPill status={m.status} isHalfTime={m.is_half_time} />
              </li>
            ))}
          </ul>
        )}

        {upcoming.length > 0 && (
          <>
            <h4 className="ow-sub">Next up</h4>
            <ul className="ow-list">
              {upcoming.slice(0, 3).map((m) => (
                <li key={m.id} className="ow-row">
                  <span className="num ow-row__no">#{m.match_number}</span>
                  <span className="ow-row__teams">
                    <TeamMark name={m.team1_name} color={m.team1_color} size={22} />
                    <span className="ow-vs">vs</span>
                    <TeamMark name={m.team2_name} color={m.team2_color} size={22} />
                  </span>
                  <span className="ow-muted ow-row__when">{formatWhen(m.date, m.time) || stageLabel(m) || 'Unscheduled'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {matches.length === 0 && <p className="ow-empty">No fixtures yet. Draw the groups and generate fixtures to start the schedule.</p>}
      </section>
    </div>
  );
}

export default TournamentOverviewTab;
