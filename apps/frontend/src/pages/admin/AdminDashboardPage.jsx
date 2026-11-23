import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { matchesApi } from '../../api/matches';
import { teamsApi } from '../../api/teams';
import { playersApi } from '../../api/players';
import { StatusPill } from '../../components/common/StatusPill';
import { Avatar } from '../../components/common/Avatar';
import { LoadingState } from '../../components/common/Common';
import { useLiveSocket } from '../../hooks/useLiveSocket';
import {
  Settings,
  Calendar,
  Users,
  Trophy,
  Play,
  Square,
  RotateCcw,
  Ban,
  CheckCircle,
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Edit2,
  X,
  ArrowRightLeft,
} from 'lucide-react';

export function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState('matches');
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Match Schedule Edit Modal State
  const [editingMatch, setEditingMatch] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    venue: '',
    duration_minutes: '',
    notes: '',
    team1_id: '',
    team2_id: '',
    label: '',
    match_number: '',
  });

  // Create Match modal state
  const emptyCreateForm = {
    type: 'extra', match_number: '',
    team1_id: '', team2_id: '', date: '', time: '', venue: '', label: '', duration_minutes: '', notes: '',
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState(null);

  // New Player Form State
  const [newPlayer, setNewPlayer] = useState({
    name: '',
    number: '',
    is_manager: false,
    dcl_id: '',
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const [mData, tData, gData] = await Promise.all([
        matchesApi.getMatches(),
        teamsApi.getTeams(),
        matchesApi.getGroups().catch(() => []),
      ]);
      setMatches(mData || []);
      setTeams(tData || []);
      setGroups(gData || []);
      if (tData?.length > 0 && !selectedTeamId) {
        setSelectedTeamId(tData[0].id);
      }
      if (gData?.length > 0 && !selectedGroupId) {
        setSelectedGroupId(gData[0].id);
      }
    } catch (err) {
      if (showLoading) setError(err.message || 'Failed to load admin data');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useLiveSocket(() => {
    loadAll(false);
  });

  useEffect(() => {
    if (selectedTeamId) {
      playersApi
        .getPlayers({ team_id: selectedTeamId })
        .then((p) => setTeamPlayers(p || []))
        .catch(() => {});
    }
  }, [selectedTeamId]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Match Actions
  const handleStartMatch = async (matchId) => {
    try {
      setActionLoading(true);
      await matchesApi.startMatch(matchId);
      showSuccess('Match started and marked LIVE!');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndMatch = async (matchId) => {
    try {
      setActionLoading(true);
      await matchesApi.endMatch(matchId);
      showSuccess('Match ended and marked Full Time (standings recalculated)!');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenMatch = async (matchId) => {
    try {
      setActionLoading(true);
      await matchesApi.reopenMatch(matchId);
      showSuccess('Match reopened to LIVE status!');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelMatch = async (matchId) => {
    try {
      setActionLoading(true);
      await matchesApi.cancelMatch(matchId);
      showSuccess('Match cancelled');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUncancelMatch = async (matchId) => {
    try {
      setActionLoading(true);
      await matchesApi.uncancelMatch(matchId);
      showSuccess('Match restored to upcoming');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Group Manual Reassignment
  const handleReassignGroup = async (teamId, newGroupId) => {
    try {
      setActionLoading(true);
      await teamsApi.updateTeam(teamId, { group_id: newGroupId });
      showSuccess('Team group assigned successfully!');
      await loadAll(false);
    } catch (err) {
      setError(err.message || 'Failed to update team group');
    } finally {
      setActionLoading(false);
    }
  };

  // Match Schedule Modal Handlers
  const handleOpenEditSchedule = (match) => {
    setEditingMatch(match);
    setScheduleForm({
      date: match.date || '',
      time: match.time || '',
      venue: match.venue || '',
      duration_minutes:
        match.duration_minutes !== null && match.duration_minutes !== undefined
          ? String(match.duration_minutes)
          : '',
      notes: match.notes || '',
      team1_id: match.team1_id || '',
      team2_id: match.team2_id || '',
      label: match.stage === 'extra' ? match.label || '' : '',
      match_number: String(match.match_number),
    });
  };

  const handleCloseEditSchedule = () => {
    setEditingMatch(null);
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!editingMatch) return;
    const canPickTeams = editingMatch.status === 'upcoming';
    const newNumber = parseInt(scheduleForm.match_number, 10);
    if (!Number.isInteger(newNumber) || newNumber < 1 || newNumber > 999) {
      setError('Match number must be a whole number between 1 and 999.');
      return;
    }
    if (matches.some((x) => x.id !== editingMatch.id && x.match_number === newNumber)) {
      setError(`Match number ${newNumber} is already used by another match.`);
      return;
    }
    const { team1_id, team2_id } = scheduleForm;
    const teamsChanged =
      canPickTeams &&
      (team1_id !== (editingMatch.team1_id || '') || team2_id !== (editingMatch.team2_id || ''));
    if (teamsChanged) {
      if (!team1_id || !team2_id) {
        setError('Select both teams for this match (or leave both unchanged).');
        return;
      }
      if (team1_id === team2_id) {
        setError('A team cannot play against itself — pick two different teams.');
        return;
      }
    }
    try {
      setActionLoading(true);
      if (teamsChanged) {
        await matchesApi.assignTeams(editingMatch.id, team1_id, team2_id);
      }
      const payload = {
        match_number: newNumber,
        date: scheduleForm.date || null,
        time: scheduleForm.time || null,
        venue: scheduleForm.venue || null,
        duration_minutes: scheduleForm.duration_minutes
          ? parseInt(scheduleForm.duration_minutes, 10)
          : null,
        notes: scheduleForm.notes || null,
      };
      if (editingMatch.stage === 'extra') payload.label = scheduleForm.label.trim() || null;
      await matchesApi.updateMatch(editingMatch.id, payload);
      showSuccess(`Match #${newNumber} updated`);
      setEditingMatch(null);
      await loadAll(false);
    } catch (err) {
      setError(err.message || 'Failed to update match schedule');
    } finally {
      setActionLoading(false);
    }
  };


  const handleOpenCreate = () => {
    setCreateForm(emptyCreateForm);
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    const f = createForm;
    if (!f.team1_id || !f.team2_id) return setCreateError('Select both teams.');
    if (f.team1_id === f.team2_id) return setCreateError('A team cannot play against itself.');
    if (!f.date) return setCreateError('Match date is required.');
    const isGroup = f.type !== 'extra';
    const number = f.match_number ? parseInt(f.match_number, 10) : null;
    if (number !== null && (!Number.isInteger(number) || number < 1 || number > 999)) {
      return setCreateError('Match number must be a whole number between 1 and 999.');
    }
    if (number !== null && matches.some((x) => x.match_number === number)) {
      return setCreateError(`Match number ${number} is already used by another match.`);
    }
    try {
      setActionLoading(true);
      setCreateError(null);
      await matchesApi.createMatch({
        stage: isGroup ? 'group' : 'extra',
        group_id: isGroup ? f.type : null,
        match_number: number,
        team1_id: f.team1_id,
        team2_id: f.team2_id,
        date: f.date,
        time: f.time || null,
        venue: f.venue.trim() || null,
        label: isGroup ? null : f.label.trim() || null,
        duration_minutes: f.duration_minutes ? parseInt(f.duration_minutes, 10) : null,
        notes: f.notes.trim() || null,
      });
      showSuccess('Match created');
      setCreateOpen(false);
      await loadAll(false);
    } catch (err) {
      setCreateError(err.message || 'Failed to create match');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMatch = async (m) => {
    const title = `#${m.match_number} (${m.team1_name || 'TBD'} vs ${m.team2_name || 'TBD'})`;
    const hasData = m.status === 'live' || m.status === 'full_time';
    const warning = hasData
      ? `Delete match ${title}?\n\nThis match is ${m.status === 'live' ? 'LIVE' : 'completed'} (score ${m.score1}-${m.score2}). ` +
        'Its result, goals, cards, lineup and all related data will be permanently deleted, and standings and player statistics will be recalculated.\n\nThis cannot be undone.'
      : `Delete match ${title}? This permanently removes the fixture and cannot be undone.`;
    if (!window.confirm(warning)) return;
    try {
      setActionLoading(true);
      await matchesApi.deleteMatch(m.id);
      showSuccess(`Match #${m.match_number} deleted`);
      await loadAll(false);
    } catch (err) {
      setError(err.message || 'Failed to delete match');
    } finally {
      setActionLoading(false);
    }
  };

  // Tournament Generation Actions
  const handleGenerateGroupFixtures = async () => {
    if (!selectedGroupId) {
      setError('Please select a group first.');
      return;
    }
    const chosenGroup = groups.find((g) => g.id === selectedGroupId);
    const groupName = chosenGroup ? `Group ${chosenGroup.name}` : 'the selected group';
    if (!window.confirm(`Generate round-robin fixtures for ${groupName}?`)) return;
    try {
      setActionLoading(true);
      await matchesApi.generateGroupFixtures(selectedGroupId);
      showSuccess(`Fixtures for ${groupName} generated successfully!`);
      await loadAll();
    } catch (err) {
      if (err.message && err.message.includes('force=true')) {
        const forceConfirm = window.confirm(
          `${groupName} already has recorded match results.\n\nDo you want to FORCE erase all recorded events and regenerate fixtures for this group?`
        );
        if (forceConfirm) {
          try {
            await matchesApi.generateGroupFixtures(selectedGroupId, true);
            showSuccess(`Fixtures for ${groupName} force-regenerated successfully!`);
            await loadAll();
            return;
          } catch (forceErr) {
            setError(forceErr.message);
            return;
          }
        }
      }
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateSemis = async () => {
    if (!window.confirm('Generate semi-finals from group standings?')) return;
    try {
      setActionLoading(true);
      await matchesApi.generateSemis();
      showSuccess('Semi-final match slots seeded from Group Standings!');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateFinal = async () => {
    if (!window.confirm('Generate final match from semi-final winners?')) return;
    try {
      setActionLoading(true);
      await matchesApi.generateFinal();
      showSuccess('Final match slot seeded from Semi-final winners!');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRandomDraw = async () => {
    if (!window.confirm('Perform random draw across groups? This alters group rosters!')) return;
    try {
      setActionLoading(true);
      await matchesApi.randomGroupDraw();
      showSuccess('Random group draw completed!');
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Player Management
  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!selectedTeamId || !newPlayer.name || !newPlayer.number) return;
    try {
      setActionLoading(true);
      await playersApi.createPlayer({
        team_id: selectedTeamId,
        name: newPlayer.name.trim(),
        number: parseInt(newPlayer.number, 10),
        is_manager: newPlayer.is_manager,
        dcl_id: newPlayer.dcl_id.trim() || undefined,
      });
      showSuccess(`Player "${newPlayer.name}" added to squad!`);
      setNewPlayer({ name: '', number: '', is_manager: false, dcl_id: '' });
      const updated = await playersApi.getPlayers({ team_id: selectedTeamId });
      setTeamPlayers(updated || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePlayer = async (playerId, name) => {
    if (!window.confirm(`Delete player ${name}?`)) return;
    try {
      setActionLoading(true);
      await playersApi.deletePlayer(playerId);
      showSuccess(`Player ${name} removed`);
      const updated = await playersApi.getPlayers({ team_id: selectedTeamId });
      setTeamPlayers(updated || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading Admin Panel..." />;

  const currentTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <div>
      <div className="section-title">
        <div>
          <h2><Settings size={24} color="var(--brand-primary)" /> Tournament Administration</h2>
          <p>Logged in as {authApi.getUsername()} &bull; MatchGrid Tournament Operations</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadAll} disabled={actionLoading}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {successMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '6px',
            background: 'rgba(62, 207, 110, 0.15)',
            border: '1px solid var(--green)',
            color: 'var(--green)',
            fontSize: '13.5px',
            marginBottom: '18px',
          }}
        >
          <CheckCircle size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: '6px',
            background: 'rgba(209, 88, 90, 0.15)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            fontSize: '13.5px',
            marginBottom: '18px',
          }}
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="sub-tabs">
        <button
          className={`sub-tab ${activeTab === 'matches' ? 'active' : ''}`}
          onClick={() => setActiveTab('matches')}
        >
          <Calendar size={14} /> Matches & Quick Actions
        </button>
        <button
          className={`sub-tab ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => setActiveTab('teams')}
        >
          <Users size={14} /> Squads & Players
        </button>
        <button
          className={`sub-tab ${activeTab === 'tournament' ? 'active' : ''}`}
          onClick={() => setActiveTab('tournament')}
        >
          <Trophy size={14} /> Tournament Stage Controls
        </button>
      </div>

      {/* TAB 1: MATCHES */}
      {activeTab === 'matches' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleOpenCreate} disabled={actionLoading}>
              <Plus size={14} /> Create Match
            </button>
          </div>
          <div className="table-wrapper">
            <table className="dcl-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Match</th>
                  <th className="num">Status</th>
                  <th className="num">Score</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id}>
                    <td className="num" style={{ fontWeight: 700 }}>
                      M{m.match_number}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {m.team1_name || 'TBD'} vs {m.team2_name || 'TBD'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--chalk-dim)', marginTop: '2px' }}>
                        <span>{m.label || `Stage: ${m.stage}`}</span>
                        {m.venue && <span> · {m.venue}</span>}
                        {m.date && <span> · {m.date}</span>}
                        {m.time && <span> · {m.time}</span>}
                        {m.duration_minutes && <span> ({m.duration_minutes}m)</span>}
                      </div>
                    </td>
                    <td className="num">
                      <StatusPill status={m.status} />
                    </td>
                    <td className="num" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px' }}>
                      {m.score1 !== null ? `${m.score1} - ${m.score2}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-match-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {/* Edit Schedule Button */}
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => handleOpenEditSchedule(m)}
                          disabled={actionLoading}
                          title="Edit Schedule & Venue"
                        >
                          <Edit2 size={12} /> Edit
                        </button>

                        {/* Live Control Link */}
                        <NavLink
                          to={`/admin/matches/${m.id}/live`}
                          className="btn btn-sm btn-primary"
                          title="Open Live Match Controller"
                        >
                          <Zap size={12} /> Live Control
                        </NavLink>

                        {/* State transitions */}
                        {m.status === 'upcoming' && (
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleStartMatch(m.id)}
                            disabled={actionLoading}
                            title="Start Match"
                          >
                            <Play size={12} /> Start
                          </button>
                        )}

                        {m.status === 'live' && (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleEndMatch(m.id)}
                            disabled={actionLoading}
                            title="End Match (Full Time)"
                          >
                            <Square size={12} /> End
                          </button>
                        )}

                        {m.status === 'full_time' && (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleReopenMatch(m.id)}
                            disabled={actionLoading}
                            title="Reopen Match"
                          >
                            <RotateCcw size={12} /> Reopen
                          </button>
                        )}

                        {m.status === 'upcoming' && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleCancelMatch(m.id)}
                            disabled={actionLoading}
                            title="Cancel Match"
                          >
                            <Ban size={12} /> Cancel
                          </button>
                        )}

                        {m.status === 'cancelled' && (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleUncancelMatch(m.id)}
                            disabled={actionLoading}
                            title="Restore Match"
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                        )}

                        {/* Delete: any match, any status — removes its events/lineup too */}
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDeleteMatch(m)}
                          disabled={actionLoading}
                          title="Delete this match and all its data"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: TEAMS & PLAYERS */}
      {activeTab === 'teams' && (
        <div className="grid-2">
          {/* Team selector and add player */}
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '14px' }}>
              Select Team
            </h3>

            <div className="field">
              <label>Select Team</label>
              <select
                className="select"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Group {t.group_name || 'None'})
                  </option>
                ))}
              </select>
            </div>

            {currentTeam && (
              <div className="field" style={{ marginTop: '14px' }}>
                <label>Assigned Group</label>
                <select
                  className="select"
                  value={groups.find((g) => g.name === currentTeam.group_name)?.id || ''}
                  onChange={(e) => handleReassignGroup(currentTeam.id, e.target.value)}
                  disabled={actionLoading || groups.length === 0}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      Group {g.name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--chalk-dim)', marginTop: '4px' }}>
                  Changes {currentTeam.name}&apos;s group assignment for standings and tournament fixtures.
                </div>
              </div>
            )}


            {/* Add Player Form */}
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--line)', paddingTop: '18px' }}>
              <h4 style={{ fontWeight: 600, fontSize: '15px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} color="var(--amber)" /> Add Player to {currentTeam?.name}
              </h4>

              <form onSubmit={handleAddPlayer}>
                <div className="field">
                  <label>Player Name *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Full name"
                    value={newPlayer.name}
                    onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid-2" style={{ gap: '10px' }}>
                  <div className="field">
                    <label>Jersey Number *</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="e.g. 7"
                      value={newPlayer.number}
                      onChange={(e) => setNewPlayer({ ...newPlayer, number: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Registration ID (optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. MG-045"
                    value={newPlayer.dcl_id}
                    onChange={(e) => setNewPlayer({ ...newPlayer, dcl_id: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <input
                    type="checkbox"
                    id="isManager"
                    checked={newPlayer.is_manager}
                    onChange={(e) => setNewPlayer({ ...newPlayer, is_manager: e.target.checked })}
                  />
                  <label htmlFor="isManager" style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--chalk)' }}>
                    Designate as Team Manager
                  </label>
                </div>

                <button type="submit" className="btn btn-primary btn-sm" disabled={actionLoading}>
                  <Plus size={14} /> Register Player
                </button>
              </form>
            </div>
          </div>

          {/* Player list for selected team */}
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '14px' }}>
              {currentTeam?.name} Roster ({teamPlayers.length})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto' }}>
              {teamPlayers.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--panel-alt)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--amber)', width: '22px' }}>
                      #{p.number}
                    </span>
                    <Avatar name={p.name} size={28} photoUrl={p.photo_url} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                        {p.name} {p.is_manager && <span style={{ fontSize: '10px', color: 'var(--amber)' }}>(Manager)</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>
                        {p.dcl_id || ''}
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeletePlayer(p.id, p.name)}
                    disabled={actionLoading}
                    title="Remove Player"
                    style={{ padding: '4px 8px' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {teamPlayers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--chalk-muted)' }}>
                  No players registered for this team yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TOURNAMENT STAGE OPERATIONS */}
      {activeTab === 'tournament' && (
        <div className="grid-2">
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '14px' }}>
              Knockout Stage Fixture Generator
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--chalk-dim)', marginBottom: '20px', lineHeight: '1.5' }}>
              Automatically read the group stage standings and advance qualifiers to the knockouts.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--panel-alt)', border: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>1. Generate Semi-finals</div>
                <p style={{ fontSize: '12.5px', color: 'var(--chalk-dim)', marginBottom: '10px' }}>
                  Seeds Match 7 (A2 vs B1) and Match 8 (B2 vs A1) from computed group standings.
                </p>
                <button className="btn btn-primary btn-sm" onClick={handleGenerateSemis} disabled={actionLoading}>
                  Seed Semi-finals
                </button>
              </div>

              <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--panel-alt)', border: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>2. Generate Final</div>
                <p style={{ fontSize: '12.5px', color: 'var(--chalk-dim)', marginBottom: '10px' }}>
                  Seeds Match 9 (Final) from Semi-final winners.
                </p>
                <button className="btn btn-success btn-sm" onClick={handleGenerateFinal} disabled={actionLoading}>
                  Seed Final Match
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '14px' }}>
              Group Fixtures & Draw Operations
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--panel-alt)', border: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Generate Group Fixtures</div>
                <p style={{ fontSize: '12.5px', color: 'var(--chalk-dim)', marginBottom: '10px' }}>
                  Rebuilds round-robin group stage matches for the selected group from its assigned teams.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    style={{ flex: '0 1 180px', padding: '6px 10px', fontSize: '13px' }}
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    disabled={actionLoading || groups.length === 0}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        Group {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={handleGenerateGroupFixtures}
                    disabled={actionLoading || !selectedGroupId}
                  >
                    Generate Group Fixtures
                  </button>
                </div>
              </div>

              <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--panel-alt)', border: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Random Group Draw</div>
                <p style={{ fontSize: '12.5px', color: 'var(--chalk-dim)', marginBottom: '10px' }}>
                  Randomly redistributes the 6 clubs into Group A and Group B.
                </p>
                <button className="btn btn-danger btn-sm" onClick={handleRandomDraw} disabled={actionLoading}>
                  Perform Random Draw
                </button>
              </div>
            </div>
          </div>

          {/* Manual Group Assignments Card */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowRightLeft size={18} color="var(--amber)" /> Manual Team Group Assignments
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--chalk-dim)', marginBottom: '16px' }}>
              Assign or move teams directly between Group A and Group B. Round-robin fixtures can be regenerated above after finalizing group rosters.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {teams.map((t) => {
                const currentGroupId = groups.find((g) => g.name === t.group_name)?.id || '';
                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--panel-alt)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={t.name} size={32} photoUrl={t.logo_url} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>
                          Assigned: <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Group {t.group_name || 'None'}</span>
                        </div>
                      </div>
                    </div>

                    <select
                      className="select"
                      style={{ width: 'auto', padding: '5px 10px', fontSize: '12.5px' }}
                      value={currentGroupId}
                      onChange={(e) => handleReassignGroup(t.id, e.target.value)}
                      disabled={actionLoading || groups.length === 0}
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          Group {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Create Match Modal */}
      {createOpen && (
        <div className="modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Plus size={18} color="var(--amber)" /> Create Match
              </h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setCreateOpen(false)}
                style={{ padding: '4px', border: 'none' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateMatch}>
              <div className="modal-body">
                <div className="grid-2" style={{ gap: '12px' }}>
                  <div className="field">
                    <label>Match Type *</label>
                    <select
                      className="input"
                      value={createForm.type}
                      onChange={(e) => setCreateForm({ ...createForm, type: e.target.value, team1_id: '', team2_id: '' })}
                    >
                      <option value="extra">Additional match (friendly)</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>Group {g.name} fixture</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Match No. (optional)</label>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      className="input"
                      placeholder="auto"
                      value={createForm.match_number}
                      onChange={(e) => setCreateForm({ ...createForm, match_number: e.target.value })}
                    />
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--chalk-dim)', marginBottom: '12px' }}>
                  {createForm.type === 'extra'
                    ? 'An additional match appears on the public Matches page but does not affect group standings or tournament stats.'
                    : 'A group fixture counts in that group\'s standings and the tournament statistics, like the original fixtures.'}
                </p>
                {createError && (
                  <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(209, 88, 90, 0.15)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: '13px' }}>
                    {createError}
                  </div>
                )}
                <div className="grid-2" style={{ gap: '12px' }}>
                  {[['team1_id', 'Team 1 *', 'team2_id'], ['team2_id', 'Team 2 *', 'team1_id']].map(([key, label, otherKey]) => (
                    <div className="field" key={key}>
                      <label>{label}</label>
                      <select
                        className="input"
                        value={createForm[key]}
                        onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.value })}
                        required
                      >
                        <option value="">Select team…</option>
                        {teams
                          .filter((t) => t.id !== createForm[otherKey])
                          .filter((t) => createForm.type === 'extra' || t.group_name === (groups.find((g) => g.id === createForm.type) || {}).name)
                          .map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="grid-2" style={{ gap: '12px' }}>
                  <div className="field">
                    <label>Match Date *</label>
                    <input type="date" className="input" required value={createForm.date}
                      onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Kickoff Time</label>
                    <input type="time" className="input" value={createForm.time}
                      onChange={(e) => setCreateForm({ ...createForm, time: e.target.value })} />
                  </div>
                </div>

                <div className="grid-2" style={{ gap: '12px' }}>
                  <div className="field">
                    <label>Venue / Pitch</label>
                    <input type="text" className="input" maxLength={200} placeholder="e.g. Stadia Main Arena"
                      value={createForm.venue} onChange={(e) => setCreateForm({ ...createForm, venue: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Duration (Minutes)</label>
                    <input type="number" min="1" max="240" className="input" placeholder="e.g. 40"
                      value={createForm.duration_minutes}
                      onChange={(e) => setCreateForm({ ...createForm, duration_minutes: e.target.value })} />
                  </div>
                </div>

                {createForm.type === 'extra' && (
                <div className="field">
                  <label>Match Title</label>
                  <input type="text" className="input" maxLength={100} placeholder="Friendly"
                    value={createForm.label} onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })} />
                </div>
                )}

                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Notes</label>
                  <textarea className="input" rows={2} maxLength={1000} value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    style={{ resize: 'vertical' }} />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  Create Match
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Edit Modal */}
      {editingMatch && (
        <div className="modal-backdrop" onClick={handleCloseEditSchedule}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Calendar size={18} color="var(--amber)" /> Edit Match
              </h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleCloseEditSchedule}
                style={{ padding: '4px', border: 'none' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule}>
              <div className="modal-body">
                <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '6px', background: 'var(--panel-alt)', fontSize: '13px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--amber)', marginBottom: '2px' }}>
                    Match #{editingMatch.match_number}: {editingMatch.team1_name || 'TBD'} vs {editingMatch.team2_name || 'TBD'}
                  </div>
                  <div style={{ color: 'var(--chalk-dim)', fontSize: '12px' }}>
                    Stage: {editingMatch.stage ? editingMatch.stage.toUpperCase() : ''} {editingMatch.label ? `(${editingMatch.label})` : ''} · Status: {editingMatch.status}
                  </div>
                </div>

                <div className="field">
                  <label>Match No. (shown as M{scheduleForm.match_number || '–'})</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    className="input"
                    required
                    value={scheduleForm.match_number}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, match_number: e.target.value })}
                  />
                </div>

                {editingMatch.stage === 'extra' && (
                  <div className="field">
                    <label>Match Title</label>
                    <input
                      type="text"
                      className="input"
                      maxLength={100}
                      placeholder="Friendly"
                      value={scheduleForm.label}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, label: e.target.value })}
                    />
                  </div>
                )}

                {editingMatch.status === 'upcoming' && (
                  <div className="grid-2" style={{ gap: '12px' }}>
                    {[['team1_id', 'Team 1', 'team2_id'], ['team2_id', 'Team 2', 'team1_id']].map(
                      ([key, label, otherKey]) => {
                        // Group matches: only that group's teams. Semi-finals: not a team
                        // already playing in the other semi-final.
                        const takenElsewhere = new Set(
                          editingMatch.stage === 'semi'
                            ? matches
                                .filter((m) => m.stage === 'semi' && m.id !== editingMatch.id)
                                .flatMap((m) => [m.team1_id, m.team2_id])
                                .filter(Boolean)
                            : [],
                        );
                        return (
                          <div className="field" key={key}>
                            <label>{label}</label>
                            <select
                              className="input"
                              value={scheduleForm[key]}
                              onChange={(e) => setScheduleForm({ ...scheduleForm, [key]: e.target.value })}
                            >
                              <option value="">TBD</option>
                              {teams
                                .filter(
                                  (t) =>
                                    !takenElsewhere.has(t.id) &&
                                    t.id !== scheduleForm[otherKey] &&
                                    (editingMatch.stage !== 'group' || t.group_name === editingMatch.group_name),
                                )
                                .map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}

                <div className="grid-2" style={{ gap: '12px' }}>
                  <div className="field">
                    <label>Match Date</label>
                    <input
                      type="date"
                      className="input"
                      value={scheduleForm.date}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Kickoff Time</label>
                    <input
                      type="time"
                      className="input"
                      value={scheduleForm.time}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid-2" style={{ gap: '12px' }}>
                  <div className="field">
                    <label>Venue / Pitch</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Stadia Main Arena"
                      value={scheduleForm.venue}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, venue: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Duration (Minutes)</label>
                    <input
                      type="number"
                      min="1"
                      max="240"
                      className="input"
                      placeholder="e.g. 90"
                      value={scheduleForm.duration_minutes}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, duration_minutes: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Notes / Broadcast Info</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="e.g. Match delayed due to weather, live stream pitch 2"
                    value={scheduleForm.notes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCloseEditSchedule}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
