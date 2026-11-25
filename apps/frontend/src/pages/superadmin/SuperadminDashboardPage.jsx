import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Trophy, Plus, Trash2, Power, RefreshCw, Search, ExternalLink, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { superadminApi } from '../../api/superadmin';
import { authApi } from '../../api/auth';
import { LoadingState, ErrorState } from '../../components/common/Common';
import { Modal, Field, Actions } from '../../components/common/Dialog';
import { formatDay } from '../../utils/dates';
import { useLiveSocket } from '../../hooks/useLiveSocket';

export function SuperadminDashboardPage() {
  const navigate = useNavigate();
  const currentUserId = authApi.getUserId();
  const currentUsername = authApi.getUsername();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [userSearch, setUserSearch] = useState('');
  const [tourneySearch, setTourneySearch] = useState('');

  // Modal State
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [orgForm, setOrgForm] = useState({
    username: '',
    email: '',
    password: '',
    organization_name: '',
  });
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState(null);

  // Tournament Deletion Confirm Modal
  const [deletingTourney, setDeletingTourney] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const [statsData, usersData, tourneysData] = await Promise.all([
        superadminApi.getStats().catch(() => null),
        superadminApi.getUsers().catch(() => []),
        superadminApi.getTournaments().catch(() => []),
      ]);
      setStats(statsData);
      setUsers(usersData || []);
      setTournaments(tourneysData || []);
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load command center data');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  useLiveSocket(
    useCallback(() => {
      loadData(false);
    }, [loadData])
  );

  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Toggle user active status
  const handleToggleStatus = async (user) => {
    if (user.id === currentUserId) {
      setError('Cannot suspend your own account');
      return;
    }
    try {
      await superadminApi.updateUserStatus(user.id, !user.is_active);
      showSuccess(`User "${user.username}" ${user.is_active ? 'suspended' : 'activated'}`);
      loadData(false);
    } catch (err) {
      setError(err.message || 'Failed to update user status');
    }
  };

  // Delete User
  const handleDeleteUser = async (user) => {
    if (user.id === currentUserId) {
      setError('Cannot delete your own account');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user "${user.username}"?`)) {
      return;
    }
    try {
      await superadminApi.deleteUser(user.id);
      showSuccess(`User "${user.username}" deleted successfully`);
      loadData(false);
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    }
  };

  // Create Organizer Submit
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setOrgLoading(true);
    setOrgError(null);
    try {
      const payload = {
        username: orgForm.username.trim(),
        password: orgForm.password,
        organization_name: orgForm.organization_name?.trim() || null,
        email: orgForm.email?.trim() || null,
      };
      await superadminApi.createOrganizer(payload);
      showSuccess(`Organizer "${orgForm.username}" created successfully`);
      setCreateOrgOpen(false);
      setOrgForm({ username: '', email: '', password: '', organization_name: '' });
      await loadData(false);
    } catch (err) {
      setOrgError(err.message || 'Failed to create organizer');
    } finally {
      setOrgLoading(false);
    }
  };

  // Delete Tournament Confirm
  const confirmDeleteTournament = async () => {
    if (!deletingTourney) return;
    setDelLoading(true);
    try {
      await superadminApi.deleteTournament(deletingTourney.id);
      showSuccess(`Tournament "${deletingTourney.name}" and associated fixtures purged successfully`);
      setDeletingTourney(null);
      loadData(false);
    } catch (err) {
      setError(err.message || 'Failed to delete tournament');
    } finally {
      setDelLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading Superadmin Command Center..." />;
  if (error && !users.length) return <ErrorState message={error} onRetry={() => loadData(true)} />;

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase().trim();
      const matchName = (u.username || '').toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      const matchOrg = (u.organization_name || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchOrg;
    }
    return true;
  });

  // Filtered Tournaments
  const filteredTournaments = tournaments.filter((t) => {
    if (tourneySearch.trim()) {
      const q = tourneySearch.toLowerCase().trim();
      const matchName = (t.name || '').toLowerCase().includes(q);
      const matchSeason = (t.season || '').toLowerCase().includes(q);
      return matchName || matchSeason;
    }
    return true;
  });

  const roles = ['ALL', 'SUPER_ADMIN', 'ORGANIZER', 'SCORER'];
  const kpis = [
    ['Total Accounts', stats?.total_users ?? users.length],
    ['Organizers', stats?.total_organizers ?? users.filter((u) => u.role === 'ORGANIZER').length],
    ['Scorers', stats?.total_scorers ?? users.filter((u) => u.role === 'SCORER').length],
    ['Tournaments', stats?.total_tournaments ?? tournaments.length],
    ['Total Fixtures', stats?.total_matches ?? 0],
  ];

  return (
    <div className="superadmin-command-center sa">
      <header className="sa-head">
        <div>
          <h1 className="sa-title"><Shield size={22} aria-hidden="true" /> Superadmin Command Center</h1>
          <p className="ow-muted">Platform Oversight · Operator <strong>{currentUsername}</strong> · Cross-Tenant Governance</p>
        </div>
        <div className="sa-head__actions">
          <button type="button" className="btn btn-sm btn-outline" onClick={() => loadData(false)} title="Refresh metrics and directory">
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
          <button type="button" className="btn btn-sm btn-primary" data-testid="create-organizer-btn" onClick={() => setCreateOrgOpen(true)}>
            <Plus size={14} aria-hidden="true" /> Create Organizer
          </button>
        </div>
      </header>

      {successMsg && (
        <div className="cockpit-banner cockpit-banner--ok" role="status">
          <CheckCircle2 size={16} aria-hidden="true" /> <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="ow-alert ow-alert--bar" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="ow-icon-btn" onClick={() => setError(null)} aria-label="Dismiss error">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <dl className="facts sa-kpis" data-testid="superadmin-kpis">
        {kpis.map(([label, value]) => (
          <div className="facts__item" key={label}>
            <dt>{label}</dt>
            <dd className="num">{value ?? '-'}</dd>
          </div>
        ))}
      </dl>

      <section className="ow-card sa-section" aria-labelledby="sa-users-h">
        <div className="sa-section__head">
          <div>
            <h2 id="sa-users-h" className="ow-h">Platform User & Role Directory</h2>
            <p className="ow-muted">Manage accounts, enforce role boundaries, and suspend or purge operators</p>
          </div>
          <div className="sa-tools">
            <select data-testid="user-role-filter" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="select sa-tools__select">
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Superadmin</option>
              <option value="ORGANIZER">Organizer</option>
              <option value="SCORER">Scorer</option>
            </select>
            <div className="filter-tabs sa-tools__tabs" role="tablist" aria-label="Role">
              {roles.map((r) => (
                <button key={r} type="button" role="tab" aria-selected={roleFilter === r} className={`filter-tab ${roleFilter === r ? 'active' : ''}`} onClick={() => setRoleFilter(r)}>
                  {r.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="sa-search">
              <Search size={14} aria-hidden="true" />
              <input type="search" className="input-field" aria-label="Search users" placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="sa-table-wrap" data-testid="superadmin-users-table">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Organization / Scope</th>
                <th>Status</th>
                <th>Created</th>
                <th className="sa-actions-h">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr className="sa-empty-row"><td colSpan={6}>No users matching criteria</td></tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id}>
                      <td className="sa-cell-main">
                        <span className="sa-name">{u.username}{isSelf && <span className="sa-you"> (You)</span>}</span>
                        {u.email && <span className="sa-sub">{u.email}</span>}
                      </td>
                      <td data-label="Role"><span className={`ow-tag sa-role sa-role--${(u.role || '').toLowerCase()}`}>{u.role}</span></td>
                      <td data-label="Scope" className="sa-muted">{u.organization_name || '—'}</td>
                      <td data-label="Status">
                        <span className={`pill ${u.is_active ? 'pill-completed' : 'pill-live'} pill-xs`}>{u.is_active ? 'ACTIVE' : 'SUSPENDED'}</span>
                      </td>
                      <td data-label="Created" className="sa-muted num">{u.created_at ? formatDay(String(u.created_at).slice(0, 10)) : '—'}</td>
                      <td className="sa-actions">
                        <button
                          type="button"
                          data-testid={`toggle-status-btn-${u.id}`}
                          className={`btn btn-xs ${u.is_active ? 'btn-outline' : 'btn-primary'}`}
                          onClick={() => handleToggleStatus(u)}
                          disabled={isSelf}
                          title={isSelf ? 'Cannot suspend self' : u.is_active ? 'Suspend account' : 'Activate account'}
                        >
                          <Power size={12} aria-hidden="true" /> {u.is_active ? 'Suspend' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={() => handleDeleteUser(u)}
                          disabled={isSelf}
                          title={isSelf ? 'Cannot delete self' : 'Permanently delete user'}
                          aria-label={`Delete user ${u.username}`}
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ow-card sa-section" aria-labelledby="sa-tourn-h">
        <div className="sa-section__head">
          <div>
            <h2 id="sa-tourn-h" className="ow-h">Global Tournament Oversight</h2>
            <p className="ow-muted">Cross-organization competition directory with public inspection and cascade deletion</p>
          </div>
          <div className="sa-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" className="input-field" aria-label="Search tournaments" placeholder="Search tournaments..." value={tourneySearch} onChange={(e) => setTourneySearch(e.target.value)} />
          </div>
        </div>

        <div className="sa-table-wrap" data-testid="superadmin-tournaments-table">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Season</th>
                <th>Slug</th>
                <th>Stage</th>
                <th>Status</th>
                <th className="sa-actions-h">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTournaments.length === 0 ? (
                <tr className="sa-empty-row"><td colSpan={6}>No tournaments recorded on platform</td></tr>
              ) : (
                filteredTournaments.map((t) => (
                  <tr key={t.id}>
                    <td className="sa-cell-main">
                      <span className="sa-name sa-name--icon">
                        {t.logo_url ? <img src={t.logo_url} alt="" className="sa-logo" /> : <Trophy size={16} aria-hidden="true" />}
                        <span>{t.name}</span>
                      </span>
                    </td>
                    <td data-label="Season" className="num">{t.season || 'Season 1'}</td>
                    <td data-label="Slug" className="sa-muted sa-slug">/t/{t.slug}</td>
                    <td data-label="Stage"><span className="pill pill-upcoming pill-xs">{t.stage ? t.stage.toUpperCase() : 'GROUP'}</span></td>
                    <td data-label="Status"><span className={`pill pill-${(t.status || 'ACTIVE').toLowerCase()} pill-xs`}>{t.status || 'ACTIVE'}</span></td>
                    <td className="sa-actions">
                      <Link to={`/t/${t.slug}`} className="btn btn-xs btn-outline" title="Open public tournament center">
                        <ExternalLink size={12} aria-hidden="true" /> Inspect
                      </Link>
                      <button type="button" className="btn btn-xs btn-danger" onClick={() => setDeletingTourney(t)} title="Permanently purge tournament and fixtures">
                        <Trash2 size={12} aria-hidden="true" /> Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {createOrgOpen && (
        <Modal testId="create-organizer-modal" title="Provision New Organizer Account" dismissOnBackdrop onClose={() => setCreateOrgOpen(false)}>
          {orgError && <div className="ow-alert" role="alert">{orgError}</div>}
          <form onSubmit={handleCreateOrg} className="ow-form">
            <Field label="Username">
              <input type="text" data-testid="org-username-input" className="input" value={orgForm.username} onChange={(e) => setOrgForm({ ...orgForm, username: e.target.value })} placeholder="e.g. premier_league_org" required />
            </Field>
            <Field label="Organization Name (Optional)">
              <input type="text" data-testid="org-organization-input" className="input" value={orgForm.organization_name} onChange={(e) => setOrgForm({ ...orgForm, organization_name: e.target.value })} placeholder="e.g. Premier League Management" />
            </Field>
            <Field label="Email Address">
              <input type="email" className="input" value={orgForm.email} onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })} placeholder="e.g. organizer@matchgrid.com" />
            </Field>
            <Field label="Initial Access Password">
              <input type="password" data-testid="org-password-input" className="input" value={orgForm.password} onChange={(e) => setOrgForm({ ...orgForm, password: e.target.value })} placeholder="••••••••••••" required />
            </Field>
            <Actions>
              <button type="button" className="btn btn-outline" onClick={() => setCreateOrgOpen(false)} disabled={orgLoading}>Cancel</button>
              <button type="submit" data-testid="submit-organizer-btn" className="btn btn-primary" disabled={orgLoading}>
                {orgLoading ? 'Provisioning...' : 'Create Organizer Account'}
              </button>
            </Actions>
          </form>
        </Modal>
      )}

      {deletingTourney && (
        <Modal testId="purge-tournament-modal" title="Purge Tournament" titleClass="is-danger" dismissOnBackdrop onClose={() => setDeletingTourney(null)}>
          <p className="ow-muted ow-modal__text">Are you sure you want to permanently delete <strong>{deletingTourney.name}</strong>?</p>
          <p className="sa-warn">Warning: This action will cascade-delete all fixtures, teams, player rosters, and associated R2 media assets. This cannot be undone.</p>
          <Actions>
            <button type="button" className="btn btn-outline" onClick={() => setDeletingTourney(null)} disabled={delLoading}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={confirmDeleteTournament} disabled={delLoading}>
              {delLoading ? 'Purging...' : 'Permanently Delete'}
            </button>
          </Actions>
        </Modal>
      )}
    </div>
  );
}

export default SuperadminDashboardPage;
