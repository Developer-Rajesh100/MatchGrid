import React, { useEffect, useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { organizerApi } from '../../api/organizer';
import { teamsApi } from '../../api/teams';
import { playersApi } from '../../api/players';
import { matchesApi } from '../../api/matches';
import { authApi } from '../../api/auth';
import { ImageUploader } from '../../components/common/ImageUploader';
import { Avatar } from '../../components/common/Avatar';
import { StatusPill } from '../../components/common/StatusPill';
import { LoadingState, ErrorState, EmptyState } from '../../components/common/Common';
import {
  Trophy,
  Users,
  Calendar,
  Activity,
  Settings,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  Shield,
  Shuffle,
  GitBranch,
  UserCheck,
  UserPlus,
  Clock,
  AlertTriangle,
  CheckCircle,
  X,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

export function OrganizerWorkspacePage() {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('teams'); // 'teams' | 'fixtures' | 'scorers' | 'settings'
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Tournament data
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [players, setPlayers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [matches, setMatches] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [tabLoading, setTabLoading] = useState(false);

  // Tournament Creation Wizard Modal
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState(null);
  const [wizardForm, setWizardForm] = useState({
    name: '',
    season: new Date().getFullYear().toString(),
    slug: '',
    description: '',
    logo_url: '',
    banner_url: '',
    config: {
      num_groups: 2,
      teams_per_group: 3,
      qualifiers_per_group: 2,
      knockout_format: 'semis_final',
      points_win: 3,
      points_draw: 1,
      points_loss: 0,
      match_duration_half_minutes: 20,
    },
  });

  // Add Club Modal
  const [clubModalOpen, setClubModalOpen] = useState(false);
  const [clubForm, setClubForm] = useState({ name: '', color: '#10B981', crest_url: '' });
  const [clubSubmitting, setClubSubmitting] = useState(false);

  // Add Player Modal
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerForm, setPlayerForm] = useState({
    name: '',
    number: '',
    is_manager: false,
    photo_url: '',
  });
  const [playerSubmitting, setPlayerSubmitting] = useState(false);

  // Provision Scorer Modal
  const [scorerModalOpen, setScorerModalOpen] = useState(false);
  const [scorerForm, setScorerForm] = useState({ username: '', password: '' });
  const [scorerSubmitting, setScorerSubmitting] = useState(false);

  // Assign Scorer Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedMatchForAssign, setSelectedMatchForAssign] = useState(null);
  const [selectedScorerIdToAssign, setSelectedScorerIdToAssign] = useState('');

  // Edit Match Schedule Modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedMatchForSchedule, setSelectedMatchForSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    venue: '',
    duration_minutes: 40,
    label: '',
  });

  // Delete Tournament Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const activeTournament = tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];

  // Helper notification toast
  const notifySuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // 1. Initial Load of Organizer's Tournaments
  const loadTournaments = useCallback(async (selectNewId = null) => {
    try {
      setLoading(true);
      setError(null);
      const list = await organizerApi.getMyTournaments();
      setTournaments(list || []);
      if (list && list.length > 0) {
        if (selectNewId) {
          setSelectedTournamentId(selectNewId);
        } else if (!selectedTournamentId || !list.some((t) => t.id === selectedTournamentId)) {
          setSelectedTournamentId(list[0].id);
        }
      } else {
        setSelectedTournamentId('');
      }
    } catch (err) {
      setError(err.message || 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, [selectedTournamentId]);

  useEffect(() => {
    loadTournaments();
  }, []);

  // 2. Load Selected Tournament's Details and Sub-entities
  const loadTournamentData = useCallback(async (tid) => {
    if (!tid) return;
    try {
      setTabLoading(true);
      const [tList, gList, mList, sList] = await Promise.all([
        teamsApi.getTeams({ tournament_id: tid }).catch(() => []),
        matchesApi.getGroups({ tournament_id: tid }).catch(() => []),
        organizerApi.getTournamentMatches(tid).catch(() => []),
        organizerApi.getScorers().catch(() => []),
      ]);
      setTeams(tList || []);
      setGroups(gList || []);
      setMatches(mList || []);
      setScorers(sList || []);

      if (tList && tList.length > 0) {
        setSelectedTeamId((prev) => (tList.some((t) => t.id === prev) ? prev : tList[0].id));
      } else {
        setSelectedTeamId('');
      }
    } catch (err) {
      setError(err.message || 'Failed to load tournament data');
    } finally {
      setTabLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTournamentId) {
      loadTournamentData(selectedTournamentId);
    }
  }, [selectedTournamentId, loadTournamentData]);

  // Load Players for the Selected Team
  useEffect(() => {
    if (selectedTeamId && selectedTournamentId) {
      playersApi
        .getPlayers({ team_id: selectedTeamId, tournament_id: selectedTournamentId })
        .then((data) => setPlayers(data || []))
        .catch(() => setPlayers([]));
    } else {
      setPlayers([]);
    }
  }, [selectedTeamId, selectedTournamentId]);

  // Wizard Name auto-slug generator
  const handleWizardNameChange = (e) => {
    const name = e.target.value;
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setWizardForm((prev) => ({
      ...prev,
      name,
      slug: prev.slug === '' || prev.slug === prev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') ? slug : prev.slug,
    }));
  };

  // Submit Wizard
  const handleCreateTournament = async (e) => {
    e.preventDefault();
    setWizardSubmitting(true);
    setWizardError(null);
    try {
      const payload = {
        name: wizardForm.name,
        season: wizardForm.season,
        slug: wizardForm.slug || wizardForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: wizardForm.description || null,
        logo_url: wizardForm.logo_url || null,
        banner_url: wizardForm.banner_url || null,
        config: wizardForm.config,
      };
      const created = await organizerApi.createTournament(payload);
      setWizardOpen(false);
      setWizardStep(1);
      setWizardForm({
        name: '',
        season: new Date().getFullYear().toString(),
        slug: '',
        description: '',
        logo_url: '',
        banner_url: '',
        config: {
          num_groups: 2,
          teams_per_group: 3,
          qualifiers_per_group: 2,
          knockout_format: 'semis_final',
          points_win: 3,
          points_draw: 1,
          points_loss: 0,
          match_duration_half_minutes: 20,
        },
      });
      notifySuccess(`Competition "${created.name}" created successfully!`);
      await loadTournaments(created.id);
    } catch (err) {
      setWizardError(err.message || 'Failed to create tournament');
    } finally {
      setWizardSubmitting(false);
    }
  };

  // Club Handlers
  const handleCreateClub = async (e) => {
    e.preventDefault();
    if (!clubForm.name.trim()) return;
    setClubSubmitting(true);
    try {
      const newTeam = await teamsApi.createTeam({
        name: clubForm.name.trim(),
        color: clubForm.color,
        crest_url: clubForm.crest_url || null,
        tournament_id: activeTournament.id,
      });
      setClubModalOpen(false);
      setClubForm({ name: '', color: '#10B981', crest_url: '' });
      notifySuccess(`Club "${newTeam.name}" registered successfully!`);
      const updatedTeams = await teamsApi.getTeams({ tournament_id: activeTournament.id });
      setTeams(updatedTeams || []);
      setSelectedTeamId(newTeam.id);
    } catch (err) {
      setError(err.message || 'Failed to add club');
    } finally {
      setClubSubmitting(false);
    }
  };

  const handleDeleteClub = async (teamId, teamName) => {
    if (!window.confirm(`Delete club "${teamName}"? This action cannot be undone.`)) return;
    try {
      await teamsApi.deleteTeam(teamId);
      notifySuccess(`Club "${teamName}" deleted.`);
      const updatedTeams = await teamsApi.getTeams({ tournament_id: activeTournament.id });
      setTeams(updatedTeams || []);
      if (selectedTeamId === teamId) {
        setSelectedTeamId(updatedTeams?.[0]?.id || '');
      }
    } catch (err) {
      setError(err.message || 'Failed to delete club');
    }
  };

  // Player Handlers
  const handleCreatePlayer = async (e) => {
    e.preventDefault();
    if (!playerForm.name.trim()) return;
    setPlayerSubmitting(true);
    try {
      await playersApi.createPlayer({
        name: playerForm.name.trim(),
        number: parseInt(playerForm.number, 10) || 0,
        is_manager: playerForm.is_manager,
        photo_url: playerForm.photo_url || null,
        team_id: selectedTeamId,
        tournament_id: activeTournament.id,
      });
      setPlayerModalOpen(false);
      setPlayerForm({ name: '', number: '', is_manager: false, photo_url: '' });
      notifySuccess(`Player "${playerForm.name}" added to squad!`);
      const updatedPlayers = await playersApi.getPlayers({
        team_id: selectedTeamId,
        tournament_id: activeTournament.id,
      });
      setPlayers(updatedPlayers || []);
    } catch (err) {
      setError(err.message || 'Failed to add player');
    } finally {
      setPlayerSubmitting(false);
    }
  };

  const handleDeletePlayer = async (playerId, playerName) => {
    if (!window.confirm(`Remove player "${playerName}" from squad?`)) return;
    try {
      await playersApi.deletePlayer(playerId);
      notifySuccess(`Player "${playerName}" removed.`);
      const updatedPlayers = await playersApi.getPlayers({
        team_id: selectedTeamId,
        tournament_id: activeTournament.id,
      });
      setPlayers(updatedPlayers || []);
    } catch (err) {
      setError(err.message || 'Failed to remove player');
    }
  };

  // Tournament Competition Operations (Random Draw, Fixture Gen, Knockout Seed)
  const handleRandomDraw = async () => {
    if (!window.confirm('Conduct random group draw for this tournament?')) return;
    try {
      setTabLoading(true);
      await matchesApi.randomGroupDraw(activeTournament.id);
      notifySuccess('Random group draw executed successfully!');
      await loadTournamentData(activeTournament.id);
    } catch (err) {
      setError(err.message || 'Failed to execute random group draw');
      setTabLoading(false);
    }
  };

  const handleGenerateFixtures = async () => {
    if (!groups || groups.length === 0) {
      setError('No groups found to generate fixtures.');
      return;
    }
    if (!window.confirm(`Generate round-robin fixtures for all ${groups.length} groups?`)) return;
    try {
      setTabLoading(true);
      for (const group of groups) {
        await matchesApi.generateGroupFixtures(group.id, true);
      }
      notifySuccess('Group stage fixtures generated!');
      await loadTournamentData(activeTournament.id);
    } catch (err) {
      setError(err.message || 'Failed to generate fixtures');
    } finally {
      setTabLoading(false);
    }
  };

  const handleSeedKnockout = async () => {
    if (!window.confirm('Seed knockout bracket based on current group stage standings?')) return;
    try {
      setTabLoading(true);
      await matchesApi.seedKnockout(activeTournament.id);
      notifySuccess('Knockout bracket seeded successfully!');
      await loadTournamentData(activeTournament.id);
    } catch (err) {
      setError(err.message || 'Failed to seed knockout bracket');
      setTabLoading(false);
    }
  };

  // Match Schedule Editor
  const openScheduleModal = (match) => {
    setSelectedMatchForSchedule(match);
    setScheduleForm({
      date: match.date || '',
      time: match.time || '',
      venue: match.venue || '',
      duration_minutes: match.duration_minutes || 40,
      label: match.label || '',
    });
    setScheduleModalOpen(true);
  };

  const handleUpdateSchedule = async (e) => {
    e.preventDefault();
    if (!selectedMatchForSchedule) return;
    try {
      await matchesApi.updateMatch(selectedMatchForSchedule.id, scheduleForm);
      setScheduleModalOpen(false);
      notifySuccess(`Match #${selectedMatchForSchedule.match_number} schedule updated.`);
      const updatedMatches = await organizerApi.getTournamentMatches(activeTournament.id);
      setMatches(updatedMatches || []);
    } catch (err) {
      setError(err.message || 'Failed to update schedule');
    }
  };

  // Scorer Provisioning & Assignment
  const handleCreateScorer = async (e) => {
    e.preventDefault();
    if (!scorerForm.username.trim() || !scorerForm.password.trim()) return;
    setScorerSubmitting(true);
    try {
      await organizerApi.createScorer(scorerForm.username.trim(), scorerForm.password.trim());
      setScorerModalOpen(false);
      setScorerForm({ username: '', password: '' });
      notifySuccess(`Scorer account "${scorerForm.username}" provisioned!`);
      const updatedScorers = await organizerApi.getScorers();
      setScorers(updatedScorers || []);
    } catch (err) {
      setError(err.message || 'Failed to provision scorer');
    } finally {
      setScorerSubmitting(false);
    }
  };

  const handleDeleteScorer = async (scorerId, scorerUsername) => {
    if (!window.confirm(`Delete scorer account "${scorerUsername}"?`)) return;
    try {
      await organizerApi.deleteScorer(scorerId);
      notifySuccess(`Scorer "${scorerUsername}" deleted.`);
      const updatedScorers = await organizerApi.getScorers();
      setScorers(updatedScorers || []);
      const updatedMatches = await organizerApi.getTournamentMatches(activeTournament.id);
      setMatches(updatedMatches || []);
    } catch (err) {
      setError(err.message || 'Failed to delete scorer');
    }
  };

  const openAssignModal = (match) => {
    setSelectedMatchForAssign(match);
    setSelectedScorerIdToAssign(scorers[0]?.id || '');
    setAssignModalOpen(true);
  };

  const handleAssignScorer = async (e) => {
    e.preventDefault();
    if (!selectedMatchForAssign || !selectedScorerIdToAssign) return;
    try {
      await organizerApi.assignScorer(selectedMatchForAssign.id, selectedScorerIdToAssign);
      setAssignModalOpen(false);
      notifySuccess('Scorer assigned to match!');
      const updatedMatches = await organizerApi.getTournamentMatches(activeTournament.id);
      setMatches(updatedMatches || []);
    } catch (err) {
      setError(err.message || 'Failed to assign scorer');
    }
  };

  const handleUnassignScorer = async (matchId, scorerId) => {
    try {
      await organizerApi.removeScorer(matchId, scorerId);
      notifySuccess('Scorer unassigned from match.');
      const updatedMatches = await organizerApi.getTournamentMatches(activeTournament.id);
      setMatches(updatedMatches || []);
    } catch (err) {
      setError(err.message || 'Failed to unassign scorer');
    }
  };

  // Tournament Deletion (Danger Zone)
  const handleDeleteTournament = async (e) => {
    e.preventDefault();
    if (deleteConfirmName !== activeTournament.name) {
      setError('Tournament name does not match confirmation.');
      return;
    }
    setDeleteSubmitting(true);
    try {
      await organizerApi.deleteTournament(activeTournament.id);
      setDeleteModalOpen(false);
      setDeleteConfirmName('');
      notifySuccess(`Tournament "${activeTournament.name}" completely deleted.`);
      await loadTournaments();
    } catch (err) {
      setError(err.message || 'Failed to delete tournament');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 16px' }}>
      {/* Toast Notification */}
      {successMsg && (
        <div
          data-testid="organizer-success-toast"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            background: 'var(--brand-primary)',
            color: '#0B0F14',
            padding: '12px 20px',
            borderRadius: '8px',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Global Error Banner */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header & Tournament Selector Bar */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '14px',
          padding: '20px 24px',
          marginBottom: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-primary)',
            }}
          >
            <Trophy size={22} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '22px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--text-primary)',
                }}
              >
                Organizer Workspace
              </h1>
              {activeTournament && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background:
                      activeTournament.stage === 'group'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : ['quarters', 'semis', 'final'].includes(activeTournament.stage)
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color:
                      activeTournament.stage === 'group'
                        ? 'var(--brand-primary)'
                        : ['quarters', 'semis', 'final'].includes(activeTournament.stage)
                        ? 'var(--brand-gold)'
                        : 'var(--text-muted)',
                  }}
                >
                  {activeTournament.stage || 'group'}
                </span>
              )}
            </div>

            {/* Tournament Selector Dropdown */}
            {tournaments.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Active Competition:</span>
                <select
                  data-testid="tournament-selector"
                  value={selectedTournamentId}
                  onChange={(e) => setSelectedTournamentId(e.target.value)}
                  style={{
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.season})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                No competitions created yet. Click "+ New Competition" to start your tournament.
              </p>
            )}
          </div>
        </div>

        {/* Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeTournament && (
            <NavLink
              to={`/t/${activeTournament.slug}`}
              target="_blank"
              className="btn btn-outline"
              data-testid="inspect-public-hub"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <ExternalLink size={14} />
              <span>Inspect Public Hub</span>
            </NavLink>
          )}

          <button
            onClick={() => {
              setWizardStep(1);
              setWizardError(null);
              setWizardOpen(true);
            }}
            className="btn btn-primary"
            data-testid="create-competition-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Plus size={15} />
            <span>+ New Competition</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      {loading ? (
        <LoadingState message="Loading organizer workspace..." />
      ) : tournaments.length === 0 ? (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            padding: '48px 24px',
            textAlign: 'center',
          }}
          data-testid="organizer-empty-state"
        >
          <EmptyState
            title="No Tournaments Created"
            description="You don't have any tournaments under your organizer profile yet. Launch a new competition with custom group stages, point systems, and knockout brackets."
            icon={Trophy}
            action={
              <button
                onClick={() => setWizardOpen(true)}
                className="btn btn-primary"
                data-testid="wizard-open-from-empty"
                style={{ marginTop: '16px' }}
              >
                Launch Competition Wizard
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* Workspace Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '24px',
              overflowX: 'auto',
            }}
          >
            <button
              onClick={() => setTab('teams')}
              className={`brand-nav-tab ${tab === 'teams' ? 'active' : ''}`}
              data-testid="tab-teams"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', border: 'none', background: 'none' }}
            >
              <Users size={16} /> Teams & Squads ({teams.length})
            </button>
            <button
              onClick={() => setTab('fixtures')}
              className={`brand-nav-tab ${tab === 'fixtures' ? 'active' : ''}`}
              data-testid="tab-fixtures"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', border: 'none', background: 'none' }}
            >
              <Calendar size={16} /> Fixtures & Draw ({matches.length})
            </button>
            <button
              onClick={() => setTab('scorers')}
              className={`brand-nav-tab ${tab === 'scorers' ? 'active' : ''}`}
              data-testid="tab-scorers"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', border: 'none', background: 'none' }}
            >
              <Activity size={16} /> Scorers & Matchday ({scorers.length})
            </button>
            <button
              onClick={() => setTab('settings')}
              className={`brand-nav-tab ${tab === 'settings' ? 'active' : ''}`}
              data-testid="tab-settings"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', border: 'none', background: 'none' }}
            >
              <Settings size={16} /> Settings & Danger Zone
            </button>
          </div>

          {/* TAB 1: TEAMS & SQUADS */}
          {tab === 'teams' && (
            <div data-testid="organizer-teams-panel">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(280px, 340px) 1fr',
                  gap: '24px',
                  alignItems: 'start',
                }}
              >
                {/* Left Column: Registered Clubs */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                    }}
                  >
                    <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Participating Clubs
                    </h2>
                    <button
                      onClick={() => setClubModalOpen(true)}
                      className="btn btn-sm btn-primary"
                      data-testid="add-club-btn"
                    >
                      <Plus size={13} /> Add Club
                    </button>
                  </div>

                  {teams.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
                      No clubs registered yet. Add clubs to this tournament.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {teams.map((team) => {
                        const isSelected = team.id === selectedTeamId;
                        return (
                          <div
                            key={team.id}
                            data-testid={`club-item-${team.id}`}
                            onClick={() => setSelectedTeamId(team.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderRadius: '8px',
                              background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-base)',
                              border: isSelected
                                ? '1.5px solid var(--brand-primary)'
                                : '1px solid var(--border-subtle)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Avatar
                                name={team.name}
                                crestUrl={team.crest_url || team.logo_url}
                                color={team.color || '#10B981'}
                                size={32}
                              />
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {team.name}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {team.player_count ?? 0} Players
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClub(team.id, team.name);
                              }}
                              className="btn btn-sm"
                              data-testid={`delete-club-btn-${team.id}`}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                padding: '4px',
                                cursor: 'pointer',
                              }}
                              title="Delete Club"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Column: Squad & Roster for Selected Club */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  {selectedTeam ? (
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingBottom: '16px',
                          borderBottom: '1px solid var(--border-subtle)',
                          marginBottom: '20px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Avatar
                            name={selectedTeam.name}
                            crestUrl={selectedTeam.crest_url || selectedTeam.logo_url}
                            color={selectedTeam.color || '#10B981'}
                            size={40}
                          />
                          <div>
                            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                              {selectedTeam.name} Roster
                            </h2>
                            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                              Club squad members and official matchday roster
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setPlayerModalOpen(true)}
                          className="btn btn-sm btn-primary"
                          data-testid="add-player-btn"
                        >
                          <Plus size={13} /> Add Player
                        </button>
                      </div>

                      {players.length === 0 ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '32px 0' }}>
                          No players registered for {selectedTeam.name} yet. Click "+ Add Player" to enroll athletes.
                        </p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                <th style={{ padding: '8px 12px' }}>#</th>
                                <th style={{ padding: '8px 12px' }}>Player</th>
                                <th style={{ padding: '8px 12px' }}>Role</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {players.map((p) => (
                                <tr
                                  key={p.id}
                                  data-testid={`player-row-${p.id}`}
                                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                                >
                                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {p.number ?? '-'}
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <Avatar name={p.name} crestUrl={p.photo_url} size={28} />
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    {p.is_manager ? (
                                      <span
                                        style={{
                                          fontSize: '11px',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          background: 'rgba(245, 158, 11, 0.15)',
                                          border: '1px solid rgba(245, 158, 11, 0.3)',
                                          color: 'var(--brand-gold)',
                                          fontWeight: 600,
                                        }}
                                      >
                                        Manager
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Squad Player</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                    <button
                                      onClick={() => handleDeletePlayer(p.id, p.name)}
                                      className="btn btn-sm"
                                      data-testid={`delete-player-btn-${p.id}`}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                      }}
                                      title="Remove Player"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0' }}>
                      Select a club from the left to view and manage its squad roster.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FIXTURES & GROUP DRAW */}
          {tab === 'fixtures' && (
            <div data-testid="organizer-fixtures-panel">
              {/* Competition Controls Bar */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '24px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Tournament Engine Operations
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    Execute dynamic draws, fixture schedules, and bracket seeding
                  </p>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    onClick={handleRandomDraw}
                    className="btn btn-sm btn-outline"
                    data-testid="random-draw-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Shuffle size={13} /> Random Group Draw
                  </button>
                  <button
                    onClick={handleGenerateFixtures}
                    className="btn btn-sm btn-outline"
                    data-testid="generate-fixtures-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Calendar size={13} /> Generate Group Fixtures
                  </button>
                  <button
                    onClick={handleSeedKnockout}
                    className="btn btn-sm btn-primary"
                    data-testid="seed-knockout-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <GitBranch size={13} /> Seed Knockout Bracket
                  </button>
                </div>
              </div>

              {/* Groups Distribution Overview */}
              {groups && groups.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                    Group Allocations ({groups.length} Groups)
                  </h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: '16px',
                    }}
                  >
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        data-testid={`group-card-${group.name}`}
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '10px',
                          padding: '14px 16px',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '14px',
                            color: 'var(--brand-primary)',
                            borderBottom: '1px solid var(--border-subtle)',
                            paddingBottom: '8px',
                            marginBottom: '10px',
                          }}
                        >
                          Group {group.name}
                        </div>
                        {group.teams && group.teams.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {group.teams.map((t) => (
                              <div
                                key={t.id || t.team_id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '13px',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                <span
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: t.color || '#10B981',
                                  }}
                                />
                                <span>{t.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                            No teams drawn yet. Click "Random Group Draw".
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matches List */}
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Competition Fixtures ({matches.length})
                  </h3>
                </div>

                {matches.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '32px 0' }}>
                    No fixtures scheduled yet. Use "Generate Group Fixtures" to schedule group matches.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px' }}>#</th>
                          <th style={{ padding: '8px 12px' }}>Matchup</th>
                          <th style={{ padding: '8px 12px' }}>Stage</th>
                          <th style={{ padding: '8px 12px' }}>Schedule</th>
                          <th style={{ padding: '8px 12px' }}>Status</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matches.map((m) => (
                          <tr
                            key={m.id}
                            data-testid={`match-row-${m.id}`}
                            style={{ borderBottom: '1px solid var(--border-subtle)' }}
                          >
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                              #{m.match_number}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {m.team1_name || 'TBD'}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700 }}>
                                  VS
                                </span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {m.team2_name || 'TBD'}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                              {m.stage} {m.label ? `(${m.label})` : ''}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {m.date ? `${m.date} ${m.time || ''}` : 'Unscheduled'}
                              {m.venue ? ` • ${m.venue}` : ''}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <StatusPill status={m.status} isHalfTime={m.is_half_time} />
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <button
                                onClick={() => openScheduleModal(m)}
                                className="btn btn-sm btn-outline"
                                data-testid={`edit-match-schedule-${m.id}`}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                <Edit2 size={12} /> Schedule
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SCORERS & MATCH ASSIGNMENTS */}
          {tab === 'scorers' && (
            <div data-testid="organizer-scorers-panel">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(280px, 340px) 1fr',
                  gap: '24px',
                  alignItems: 'start',
                }}
              >
                {/* Left Column: Organizer's Provisioned Scorers */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Scorer Roster ({scorers.length})
                    </h3>
                    <button
                      onClick={() => setScorerModalOpen(true)}
                      className="btn btn-sm btn-primary"
                      data-testid="create-scorer-btn"
                    >
                      <UserPlus size={13} /> Provision Scorer
                    </button>
                  </div>

                  {scorers.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
                      No scorers provisioned yet. Click "Provision Scorer" to create matchday operator credentials.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {scorers.map((s) => (
                        <div
                          key={s.id}
                          data-testid={`scorer-card-${s.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: 'var(--brand-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <UserCheck size={14} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                                {s.username}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Role: {s.role}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteScorer(s.id, s.username)}
                            className="btn btn-sm"
                            data-testid={`delete-scorer-btn-${s.id}`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px',
                            }}
                            title="Delete Scorer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Matchday Operator Assignments */}
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Match Scorer Assignments
                  </h3>

                  {matches.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '32px 0' }}>
                      No matches available to assign. Generate fixtures first.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px' }}>#</th>
                            <th style={{ padding: '8px 12px' }}>Fixture</th>
                            <th style={{ padding: '8px 12px' }}>Assigned Scorers</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matches.map((m) => {
                            const assignedList = m.assigned_scorer_ids || [];
                            return (
                              <tr
                                key={m.id}
                                data-testid={`match-scorer-row-${m.id}`}
                                style={{ borderBottom: '1px solid var(--border-subtle)' }}
                              >
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                                  #{m.match_number}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {m.team1_name || 'TBD'} vs {m.team2_name || 'TBD'}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  {assignedList.length === 0 ? (
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                      No scorer assigned
                                    </span>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {assignedList.map((sid) => {
                                        const scorerObj = scorers.find((s) => s.id === sid);
                                        const sName = scorerObj ? scorerObj.username : sid;
                                        return (
                                          <span
                                            key={sid}
                                            data-testid={`assigned-scorer-chip-${sid}`}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              padding: '2px 8px',
                                              borderRadius: '4px',
                                              background: 'rgba(16, 185, 129, 0.12)',
                                              border: '1px solid rgba(16, 185, 129, 0.3)',
                                              color: 'var(--brand-primary)',
                                              fontSize: '11.5px',
                                              fontWeight: 600,
                                            }}
                                          >
                                            {sName}
                                            <button
                                              onClick={() => handleUnassignScorer(m.id, sid)}
                                              style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--brand-primary)',
                                                cursor: 'pointer',
                                                padding: '0 2px',
                                                display: 'flex',
                                                alignItems: 'center',
                                              }}
                                              title="Unassign"
                                            >
                                              <X size={11} />
                                            </button>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => openAssignModal(m)}
                                    className="btn btn-sm btn-outline"
                                    data-testid={`assign-scorer-btn-${m.id}`}
                                    style={{ padding: '4px 8px', fontSize: '12px' }}
                                  >
                                    + Assign
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SETTINGS & DANGER ZONE */}
          {tab === 'settings' && activeTournament && (
            <div data-testid="organizer-settings-panel">
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '24px',
                }}
              >
                <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Tournament Configuration
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div style={{ background: 'var(--bg-base)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Slug
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                      {activeTournament.slug}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-base)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Groups Count
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                      {activeTournament.config?.num_groups ?? 2} Groups
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-base)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Knockout Format
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                      {activeTournament.config?.knockout_format ?? 'semis_final'}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-base)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Half Duration
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                      {activeTournament.config?.match_duration_half_minutes ?? 20} min
                    </div>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  padding: '24px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <AlertTriangle size={20} color="var(--brand-danger)" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--brand-danger)' }}>
                    Danger Zone: Delete Tournament
                  </h3>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Permanently delete competition <strong>{activeTournament.name}</strong> along with all associated teams, players, fixtures, and standings. This action cannot be reversed.
                </p>
                <button
                  onClick={() => {
                    setDeleteConfirmName('');
                    setDeleteModalOpen(true);
                  }}
                  className="btn btn-danger"
                  data-testid="delete-tournament-btn"
                >
                  <Trash2 size={14} /> Delete This Competition
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: TOURNAMENT CREATION WIZARD */}
      {wizardOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} data-testid="wizard-modal">
          <div
            className="modal-card"
            style={{ maxWidth: '600px', width: '100%', background: 'var(--bg-surface)' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '16px',
                borderBottom: '1px solid var(--border-subtle)',
                marginBottom: '20px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Tournament Creation Wizard
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Step {wizardStep} of 2: {wizardStep === 1 ? 'Identity & Branding' : 'Format & Competition Rules'}
                </div>
              </div>
              <button
                onClick={() => setWizardOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {wizardError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  color: '#f87171',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {wizardError}
              </div>
            )}

            <form onSubmit={handleCreateTournament}>
              {wizardStep === 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Tournament Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Champions Cup 2026"
                      data-testid="wizard-name"
                      value={wizardForm.name}
                      onChange={handleWizardNameChange}
                      className="form-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Season *
                      </label>
                      <input
                        type="text"
                        required
                        data-testid="wizard-season"
                        value={wizardForm.season}
                        onChange={(e) => setWizardForm({ ...wizardForm, season: e.target.value })}
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        URL Slug
                      </label>
                      <input
                        type="text"
                        data-testid="wizard-slug"
                        value={wizardForm.slug}
                        onChange={(e) => setWizardForm({ ...wizardForm, slug: e.target.value })}
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Description (Optional)
                    </label>
                    <textarea
                      rows={2}
                      data-testid="wizard-description"
                      value={wizardForm.description}
                      onChange={(e) => setWizardForm({ ...wizardForm, description: e.target.value })}
                      className="form-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  {/* Logo & Banner R2 Uploaders */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        Tournament Crest / Logo
                      </label>
                      <ImageUploader
                        category="crests"
                        currentUrl={wizardForm.logo_url}
                        onUploadSuccess={(url) => setWizardForm((prev) => ({ ...prev, logo_url: url }))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        Hero Banner
                      </label>
                      <ImageUploader
                        category="banners"
                        currentUrl={wizardForm.banner_url}
                        onUploadSuccess={(url) => setWizardForm((prev) => ({ ...prev, banner_url: url }))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <button
                      type="button"
                      disabled={!wizardForm.name.trim()}
                      onClick={() => setWizardStep(2)}
                      className="btn btn-primary"
                      data-testid="wizard-next-btn"
                    >
                      Next: Rules & Format <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Number of Groups
                      </label>
                      <select
                        data-testid="wizard-num-groups"
                        value={wizardForm.config.num_groups}
                        onChange={(e) =>
                          setWizardForm({
                            ...wizardForm,
                            config: { ...wizardForm.config, num_groups: parseInt(e.target.value, 10) },
                          })
                        }
                        className="form-input"
                        style={{ width: '100%' }}
                      >
                        <option value={2}>2 Groups (A, B)</option>
                        <option value={4}>4 Groups (A, B, C, D)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Teams Per Group
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={8}
                        data-testid="wizard-teams-per-group"
                        value={wizardForm.config.teams_per_group}
                        onChange={(e) =>
                          setWizardForm({
                            ...wizardForm,
                            config: { ...wizardForm.config, teams_per_group: parseInt(e.target.value, 10) },
                          })
                        }
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Qualifiers Per Group
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        data-testid="wizard-qualifiers-per-group"
                        value={wizardForm.config.qualifiers_per_group}
                        onChange={(e) =>
                          setWizardForm({
                            ...wizardForm,
                            config: { ...wizardForm.config, qualifiers_per_group: parseInt(e.target.value, 10) },
                          })
                        }
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Knockout Bracket Format
                      </label>
                      <select
                        data-testid="wizard-knockout-format"
                        value={wizardForm.config.knockout_format}
                        onChange={(e) =>
                          setWizardForm({
                            ...wizardForm,
                            config: { ...wizardForm.config, knockout_format: e.target.value },
                          })
                        }
                        className="form-input"
                        style={{ width: '100%' }}
                      >
                        <option value="semis_final">Semi-Finals & Final</option>
                        <option value="quarters_semis_final">Quarter-Finals, Semis & Final</option>
                        <option value="none">No Knockout Stage (Round-Robin Only)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Half Duration (Minutes)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={45}
                        data-testid="wizard-half-duration"
                        value={wizardForm.config.match_duration_half_minutes}
                        onChange={(e) =>
                          setWizardForm({
                            ...wizardForm,
                            config: {
                              ...wizardForm.config,
                              match_duration_half_minutes: parseInt(e.target.value, 10),
                            },
                          })
                        }
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                        Points (Win / Draw / Loss)
                      </label>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '10px 0' }}>
                        3 pts (Win) / 1 pt (Draw) / 0 pts (Loss)
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '20px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="btn btn-outline"
                      data-testid="wizard-back-btn"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={wizardSubmitting}
                      className="btn btn-primary"
                      data-testid="wizard-submit-btn"
                    >
                      {wizardSubmitting ? 'Creating Competition...' : 'Create Tournament'}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD CLUB */}
      {clubModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} data-testid="add-club-modal">
          <div className="modal-card" style={{ maxWidth: '440px', width: '100%', background: 'var(--bg-surface)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Register Participating Club
              </h3>
              <button
                onClick={() => setClubModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateClub} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Club Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dynamo FC"
                  data-testid="club-name-input"
                  value={clubForm.name}
                  onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Club Color
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="color"
                    data-testid="club-color-input"
                    value={clubForm.color}
                    onChange={(e) => setClubForm({ ...clubForm, color: e.target.value })}
                    style={{ width: '40px', height: '36px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{clubForm.color}</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Team Crest / Logo
                </label>
                <ImageUploader
                  category="crests"
                  tournamentId={activeTournament?.id}
                  currentUrl={clubForm.crest_url}
                  onUploadSuccess={(url) => setClubForm((prev) => ({ ...prev, crest_url: url }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setClubModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clubSubmitting}
                  className="btn btn-primary"
                  data-testid="club-submit-btn"
                >
                  {clubSubmitting ? 'Registering...' : 'Register Club'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD PLAYER */}
      {playerModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} data-testid="add-player-modal">
          <div className="modal-card" style={{ maxWidth: '440px', width: '100%', background: 'var(--bg-surface)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Enroll Squad Player
              </h3>
              <button
                onClick={() => setPlayerModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePlayer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Leo Silva"
                  data-testid="player-name-input"
                  value={playerForm.name}
                  onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Jersey Number
                </label>
                <input
                  type="number"
                  placeholder="e.g. 10"
                  data-testid="player-number-input"
                  value={playerForm.number}
                  onChange={(e) => setPlayerForm({ ...playerForm, number: e.target.value })}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="managerCheck"
                  data-testid="player-manager-check"
                  checked={playerForm.is_manager}
                  onChange={(e) => setPlayerForm({ ...playerForm, is_manager: e.target.checked })}
                />
                <label htmlFor="managerCheck" style={{ fontSize: '13px', cursor: 'pointer' }}>
                  Designate as Team Manager
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Player Headshot
                </label>
                <ImageUploader
                  category="photos"
                  tournamentId={activeTournament?.id}
                  currentUrl={playerForm.photo_url}
                  onUploadSuccess={(url) => setPlayerForm((prev) => ({ ...prev, photo_url: url }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setPlayerModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={playerSubmitting}
                  className="btn btn-primary"
                  data-testid="player-submit-btn"
                >
                  {playerSubmitting ? 'Enrolling...' : 'Enroll Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: PROVISION SCORER */}
      {scorerModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} data-testid="provision-scorer-modal">
          <div className="modal-card" style={{ maxWidth: '400px', width: '100%', background: 'var(--bg-surface)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Provision Scorer Operator
              </h3>
              <button
                onClick={() => setScorerModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateScorer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Username *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. scorer_pitch1"
                  data-testid="scorer-username-input"
                  value={scorerForm.username}
                  onChange={(e) => setScorerForm({ ...scorerForm, username: e.target.value })}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  data-testid="scorer-password-input"
                  value={scorerForm.password}
                  onChange={(e) => setScorerForm({ ...scorerForm, password: e.target.value })}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setScorerModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scorerSubmitting}
                  className="btn btn-primary"
                  data-testid="submit-scorer-btn"
                >
                  {scorerSubmitting ? 'Provisioning...' : 'Provision Scorer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ASSIGN SCORER TO MATCH */}
      {assignModalOpen && selectedMatchForAssign && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} data-testid="assign-scorer-modal">
          <div className="modal-card" style={{ maxWidth: '420px', width: '100%', background: 'var(--bg-surface)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Assign Scorer to Match #{selectedMatchForAssign.match_number}
              </h3>
              <button
                onClick={() => setAssignModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAssignScorer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Select Scorer Operator
                </label>
                {scorers.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    No scorers provisioned yet. Please provision a scorer first.
                  </p>
                ) : (
                  <select
                    data-testid="select-scorer-dropdown"
                    value={selectedScorerIdToAssign}
                    onChange={(e) => setSelectedScorerIdToAssign(e.target.value)}
                    className="form-input"
                    style={{ width: '100%' }}
                  >
                    {scorers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.username}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scorers.length === 0}
                  className="btn btn-primary"
                  data-testid="confirm-assign-btn"
                >
                  Assign Operator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: EDIT MATCH SCHEDULE */}
      {scheduleModalOpen && selectedMatchForSchedule && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} data-testid="schedule-match-modal">
          <div className="modal-card" style={{ maxWidth: '440px', width: '100%', background: 'var(--bg-surface)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Edit Schedule: Match #{selectedMatchForSchedule.match_number}
              </h3>
              <button
                onClick={() => setScheduleModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    data-testid="match-date-input"
                    value={scheduleForm.date}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })}
                    className="form-input"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Time
                  </label>
                  <input
                    type="time"
                    data-testid="match-time-input"
                    value={scheduleForm.time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                    className="form-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Venue
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pitch 1"
                  data-testid="match-venue-input"
                  value={scheduleForm.venue}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, venue: e.target.value })}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Round Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. Group A Matchday 1"
                  data-testid="match-label-input"
                  value={scheduleForm.label}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, label: e.target.value })}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="save-schedule-btn"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: DELETE TOURNAMENT CONFIRMATION */}
      {deleteModalOpen && activeTournament && (
        <div className="modal-overlay" style={{ zIndex: 1000 }} data-testid="delete-tournament-modal">
          <div className="modal-card" style={{ maxWidth: '440px', width: '100%', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <AlertTriangle size={20} color="var(--brand-danger)" />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--brand-danger)' }}>
                Confirm Competition Deletion
              </h3>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              This will cascade-delete <strong>{activeTournament.name}</strong>, all clubs, players, fixtures, and standings. To proceed, please type the tournament name below:
            </p>

            <form onSubmit={handleDeleteTournament} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input
                type="text"
                placeholder={activeTournament.name}
                data-testid="delete-confirm-input"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="form-input"
                style={{ width: '100%' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteConfirmName !== activeTournament.name || deleteSubmitting}
                  className="btn btn-danger"
                  data-testid="confirm-delete-tournament-btn"
                >
                  {deleteSubmitting ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrganizerWorkspacePage;
