import React from 'react';
import { NavLink } from 'react-router-dom';
import { Trophy, Users, Calendar, Activity, Settings, ExternalLink, AlertTriangle, CheckCircle, X, LayoutDashboard } from 'lucide-react';
import { LoadingState, EmptyState } from '../../components/common/Common';
import { useOrganizerWorkspace } from './useOrganizerWorkspace';
import { TournamentOverviewTab } from './tabs/TournamentOverviewTab';
import { TeamsSquadsTab } from './tabs/TeamsSquadsTab';
import { FixturesDrawTab } from './tabs/FixturesDrawTab';
import { ScorersStaffTab } from './tabs/ScorersStaffTab';
import { TournamentSettingsTab } from './tabs/TournamentSettingsTab';
import { WorkspaceDialogs } from './tabs/WorkspaceDialogs';

export function OrganizerWorkspacePage() {
  const ws = useOrganizerWorkspace();
  const { tournaments, activeTournament, selectedTournamentId, setSelectedTournamentId, tab, setTab, loading, error, setError, successMsg } = ws;

  const tabs = [
    { id: 'overview', testId: 'tab-overview', icon: LayoutDashboard, label: 'Overview' },
    { id: 'teams', testId: 'tab-teams', icon: Users, label: 'Teams & Squads', count: ws.teams.length },
    { id: 'fixtures', testId: 'tab-fixtures', icon: Calendar, label: 'Fixtures & Draw', count: ws.matches.length },
    { id: 'scorers', testId: 'tab-scorers', icon: Activity, label: 'Scorers & Matchday', count: ws.scorers.length },
    { id: 'settings', testId: 'tab-settings', icon: Settings, label: 'Settings & Danger Zone' },
  ];

  return (
    <div className="ow">
      {successMsg && (
        <div data-testid="organizer-success-toast" className="ow-toast" role="status">
          <CheckCircle size={18} aria-hidden="true" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Sticky: competition selector, the public link and "+ New Competition" stay reachable while a long tab scrolls */}
      <header className="ow-bar">
        <div className="ow-bar__id">
          <span className="ow-bar__icon"><Trophy size={20} aria-hidden="true" /></span>
          <div className="ow-bar__text">
            <h1 className="ow-bar__title">Organizer Workspace</h1>
            {tournaments.length > 0 ? (
              <label className="ow-bar__select">
                <span className="ow-muted">Active Competition:</span>
                <select data-testid="tournament-selector" value={selectedTournamentId} onChange={(e) => setSelectedTournamentId(e.target.value)} className="select">
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.season})</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="ow-muted">No competitions created yet. Click "+ New Competition" to start your tournament.</p>
            )}
          </div>
        </div>
        <div className="ow-bar__actions">
          {activeTournament && (
            <NavLink to={`/t/${activeTournament.slug}`} target="_blank" className="btn btn-outline btn-sm" data-testid="inspect-public-hub">
              <ExternalLink size={14} aria-hidden="true" />
              <span>Inspect Public Hub</span>
            </NavLink>
          )}
          <button onClick={ws.openWizard} className="btn btn-primary btn-sm" data-testid="create-competition-btn">
            <span>+ New Competition</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="ow-alert ow-alert--bar" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="ow-icon-btn" onClick={() => setError(null)} aria-label="Dismiss error">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState message="Loading organizer workspace..." />
      ) : tournaments.length === 0 ? (
        <div className="ow-card ow-blank" data-testid="organizer-empty-state">
          <EmptyState
            title="No Tournaments Created"
            description="You don't have any tournaments under your organizer profile yet. Launch a new competition with custom group stages, point systems, and knockout brackets."
            icon={Trophy}
            action={
              <button onClick={ws.openWizard} className="btn btn-primary" data-testid="wizard-open-from-empty">
                Launch Competition Wizard
              </button>
            }
          />
        </div>
      ) : (
        <>
          <nav className="ow-tabs" aria-label="Workspace sections">
            {tabs.map(({ id, testId, icon: Icon, label, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`ow-tab ${tab === id ? 'is-on' : ''}`}
                aria-current={tab === id ? 'page' : undefined}
                data-testid={testId}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
                {count !== undefined && <span className="ow-tab__count num">({count})</span>}
              </button>
            ))}
          </nav>

          {tab === 'overview' && activeTournament && <TournamentOverviewTab ws={ws} />}
          {tab === 'teams' && <TeamsSquadsTab ws={ws} />}
          {tab === 'fixtures' && <FixturesDrawTab ws={ws} />}
          {tab === 'scorers' && <ScorersStaffTab ws={ws} />}
          {tab === 'settings' && activeTournament && <TournamentSettingsTab ws={ws} />}
        </>
      )}

      <WorkspaceDialogs ws={ws} />
    </div>
  );
}

export default OrganizerWorkspacePage;
