import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield,
  Users,
  Trophy,
  Activity,
  Plus,
  Trash2,
  Power,
  RefreshCw,
  Search,
  ExternalLink,
  AlertTriangle,
  X,
  CheckCircle2,
} from 'lucide-react';
import { superadminApi } from '../../api/superadmin';
import { authApi } from '../../api/auth';
import { LoadingState, ErrorState, StatTile } from '../../components/common/Common';
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

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
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

  return (
    <div className="superadmin-command-center" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand-primary)',
              }}
            >
              <Shield size={22} />
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800, margin: 0 }}>
              Superadmin Command Center
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            Platform Oversight &bull; Operator <strong style={{ color: 'var(--text-primary)' }}>{currentUsername}</strong> &bull; Cross-Tenant Governance
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => loadData(false)}
            title="Refresh metrics and directory"
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            data-testid="create-organizer-btn"
            onClick={() => setCreateOrgOpen(true)}
          >
            <Plus size={14} /> Create Organizer
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: 'var(--brand-primary)',
            fontSize: '13.5px',
            marginBottom: '20px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'var(--status-live-tint)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--status-live)',
            fontSize: '13.5px',
            marginBottom: '20px',
          }}
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Platform KPI Metric Cards */}
      <div className="stat-grid" data-testid="superadmin-kpis" style={{ marginBottom: '32px' }}>
        <StatTile label="Total Accounts" value={stats?.total_users ?? users.length} />
        <StatTile label="Organizers" value={stats?.total_organizers ?? users.filter((u) => u.role === 'ORGANIZER').length} />
        <StatTile label="Scorers" value={stats?.total_scorers ?? users.filter((u) => u.role === 'SCORER').length} />
        <StatTile label="Tournaments" value={stats?.total_tournaments ?? tournaments.length} />
        <StatTile label="Total Fixtures" value={stats?.total_matches ?? 0} />
      </div>

      {/* Section 1: User & Role Directory */}
      <div className="card" style={{ marginBottom: '36px', padding: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px 0' }}>
              Platform User & Role Directory
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Manage accounts, enforce role boundaries, and suspend or purge operators
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Role Filter Select */}
            <select
              data-testid="user-role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="select"
              style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Superadmin</option>
              <option value="ORGANIZER">Organizer</option>
              <option value="SCORER">Scorer</option>
            </select>

            {/* Role Filter Tabs */}
            <div className="filter-tabs" role="tablist">
              {['ALL', 'SUPER_ADMIN', 'ORGANIZER', 'SCORER'].map((r) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={roleFilter === r}
                  className={`filter-tab ${roleFilter === r ? 'active' : ''}`}
                  onClick={() => setRoleFilter(r)}
                  style={{ fontSize: '12px', padding: '5px 10px' }}
                >
                  {r.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                className="input-field"
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ paddingLeft: '32px', height: '34px', fontSize: '12.5px' }}
              />
            </div>
          </div>
        </div>

        {/* User Table */}
        <div className="table-container" data-testid="superadmin-users-table" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: '13px' }}>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Organization / Scope</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No users matching criteria
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const roleColor =
                    u.role === 'SUPER_ADMIN'
                      ? 'var(--accent-gold)'
                      : u.role === 'ORGANIZER'
                      ? 'var(--brand-primary)'
                      : 'var(--text-secondary)';

                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {u.username} {isSelf && <span style={{ fontSize: '11px', color: 'var(--brand-primary)' }}>(You)</span>}
                        {u.email && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 400 }}>{u.email}</div>}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'var(--bg-elevated)',
                            color: roleColor,
                            border: `1px solid ${roleColor}40`,
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {u.organization_name || '—'}
                      </td>
                      <td>
                        <span className={`pill ${u.is_active ? 'pill-completed' : 'pill-live'} pill-xs`}>
                          {u.is_active ? 'ACTIVE' : 'SUSPENDED'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            data-testid={`toggle-status-btn-${u.id}`}
                            className={`btn btn-xs ${u.is_active ? 'btn-outline' : 'btn-primary'}`}
                            onClick={() => handleToggleStatus(u)}
                            disabled={isSelf}
                            title={isSelf ? 'Cannot suspend self' : u.is_active ? 'Suspend account' : 'Activate account'}
                          >
                            <Power size={12} /> {u.is_active ? 'Suspend' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-danger"
                            onClick={() => handleDeleteUser(u)}
                            disabled={isSelf}
                            title={isSelf ? 'Cannot delete self' : 'Permanently delete user'}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Global Tournament Oversight Table */}
      <div className="card" style={{ padding: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px 0' }}>
              Global Tournament Oversight
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Cross-organization competition directory with public inspection and cascade deletion
            </p>
          </div>

          <div style={{ position: 'relative', width: '220px' }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              className="input-field"
              placeholder="Search tournaments..."
              value={tourneySearch}
              onChange={(e) => setTourneySearch(e.target.value)}
              style={{ paddingLeft: '32px', height: '34px', fontSize: '12.5px' }}
            />
          </div>
        </div>

        <div className="table-container" data-testid="superadmin-tournaments-table" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: '13px' }}>
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Season</th>
                <th>Slug</th>
                <th>Stage</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTournaments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No tournaments recorded on platform
                  </td>
                </tr>
              ) : (
                filteredTournaments.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {t.logo_url ? (
                          <img
                            src={t.logo_url}
                            alt=""
                            style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'contain' }}
                          />
                        ) : (
                          <Trophy size={16} style={{ color: 'var(--brand-primary)' }} />
                        )}
                        <span>{t.name}</span>
                      </div>
                    </td>
                    <td>{t.season || 'Season 1'}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      /t/{t.slug}
                    </td>
                    <td>
                      <span className="pill pill-upcoming pill-xs">
                        {t.stage ? t.stage.toUpperCase() : 'GROUP'}
                      </span>
                    </td>
                    <td>
                      <span className={`pill pill-${(t.status || 'ACTIVE').toLowerCase()} pill-xs`}>
                        {t.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <Link
                          to={`/t/${t.slug}`}
                          className="btn btn-xs btn-outline"
                          title="Open public tournament center"
                        >
                          <ExternalLink size={12} /> Inspect
                        </Link>
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={() => setDeletingTourney(t)}
                          title="Permanently purge tournament and fixtures"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Create Organizer Modal */}
      {createOrgOpen && (
        <div className="modal-overlay" data-testid="create-organizer-modal" onClick={() => setCreateOrgOpen(false)}>
          <div
            className="card modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', width: '100%', padding: '28px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Provision New Organizer Account
              </h3>
              <button
                type="button"
                onClick={() => setCreateOrgOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {orgError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: 'var(--status-live-tint)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: 'var(--status-live)',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {orgError}
              </div>
            )}

            <form onSubmit={handleCreateOrg}>
              <div className="field">
                <label>Username</label>
                <input
                  type="text"
                  data-testid="org-username-input"
                  className="input"
                  value={orgForm.username}
                  onChange={(e) => setOrgForm({ ...orgForm, username: e.target.value })}
                  placeholder="e.g. premier_league_org"
                  required
                />
              </div>

              <div className="field">
                <label>Organization Name (Optional)</label>
                <input
                  type="text"
                  data-testid="org-organization-input"
                  className="input"
                  value={orgForm.organization_name}
                  onChange={(e) => setOrgForm({ ...orgForm, organization_name: e.target.value })}
                  placeholder="e.g. Premier League Management"
                />
              </div>

              <div className="field">
                <label>Email Address</label>
                <input
                  type="email"
                  className="input"
                  value={orgForm.email}
                  onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                  placeholder="e.g. organizer@matchgrid.com"
                />
              </div>

              <div className="field" style={{ marginBottom: '24px' }}>
                <label>Initial Access Password</label>
                <input
                  type="password"
                  data-testid="org-password-input"
                  className="input"
                  value={orgForm.password}
                  onChange={(e) => setOrgForm({ ...orgForm, password: e.target.value })}
                  placeholder="••••••••••••"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCreateOrgOpen(false)}
                  disabled={orgLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="submit-organizer-btn"
                  className="btn btn-primary"
                  disabled={orgLoading}
                >
                  {orgLoading ? 'Provisioning...' : 'Create Organizer Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Delete Tournament Cascade Confirmation */}
      {deletingTourney && (
        <div className="modal-overlay" onClick={() => setDeletingTourney(null)}>
          <div
            className="card modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px', width: '100%', padding: '28px', borderLeft: '4px solid var(--status-live)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--status-live)' }}>
              <AlertTriangle size={22} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Purge Tournament
              </h3>
            </div>

            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong>{deletingTourney.name}</strong>?
            </p>
            <p style={{ fontSize: '12.5px', color: 'var(--status-live)', background: 'var(--status-live-tint)', padding: '8px 12px', borderRadius: '6px' }}>
              Warning: This action will cascade-delete all fixtures, teams, player rosters, and associated R2 media assets. This cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDeletingTourney(null)}
                disabled={delLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDeleteTournament}
                disabled={delLoading}
              >
                {delLoading ? 'Purging...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperadminDashboardPage;
