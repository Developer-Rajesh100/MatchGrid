import { useEffect, useState, useCallback, useRef } from 'react';
import { organizerApi } from '../../api/organizer';
import { teamsApi } from '../../api/teams';
import { playersApi } from '../../api/players';
import { matchesApi } from '../../api/matches';

const freshWizard = () => ({
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

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * All state and actions behind the Organizer Workspace. The page and its tab components only render
 * from this and call back into it, so each tab stays small and the behaviour is testable in one place.
 */
export function useOrganizerWorkspace() {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview'); // overview | teams | fixtures | scorers | settings
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [players, setPlayers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [matches, setMatches] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [tabLoading, setTabLoading] = useState(false);

  // One open dialog at a time: null | 'wizard' | 'club' | 'player' | 'scorer' | 'assign' | 'schedule' | 'delete'
  const [dialog, setDialog] = useState(null);
  const closeDialog = () => setDialog(null);

  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState(null);
  const [wizardForm, setWizardForm] = useState(freshWizard);

  const [clubForm, setClubForm] = useState({ name: '', color: '#10B981', crest_url: '' });
  const [clubSubmitting, setClubSubmitting] = useState(false);

  const [playerForm, setPlayerForm] = useState({ name: '', number: '', is_manager: false, photo_url: '' });
  const [playerSubmitting, setPlayerSubmitting] = useState(false);

  const [scorerForm, setScorerForm] = useState({ username: '', password: '' });
  const [scorerSubmitting, setScorerSubmitting] = useState(false);

  const [selectedMatchForAssign, setSelectedMatchForAssign] = useState(null);
  const [selectedScorerIdToAssign, setSelectedScorerIdToAssign] = useState('');

  const [selectedMatchForSchedule, setSelectedMatchForSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ date: '', time: '', venue: '', duration_minutes: 40, label: '' });

  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const activeTournament = tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const notifySuccess = (msg) => {
    setSuccessMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setSuccessMsg(null), 4000);
  };

  const loadTournaments = useCallback(
    async (selectNewId = null) => {
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
    },
    [selectedTournamentId]
  );

  useEffect(() => {
    loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (selectedTournamentId) loadTournamentData(selectedTournamentId);
  }, [selectedTournamentId, loadTournamentData]);

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

  const refreshMatches = async () => setMatches((await organizerApi.getTournamentMatches(activeTournament.id)) || []);
  const refreshScorers = async () => setScorers((await organizerApi.getScorers()) || []);
  const refreshPlayers = async () =>
    setPlayers((await playersApi.getPlayers({ team_id: selectedTeamId, tournament_id: activeTournament.id })) || []);

  // ---- Wizard
  const openWizard = () => {
    setWizardStep(1);
    setWizardError(null);
    setDialog('wizard');
  };

  const handleWizardNameChange = (e) => {
    const name = e.target.value;
    const slug = slugify(name);
    setWizardForm((prev) => ({
      ...prev,
      name,
      slug: prev.slug === '' || prev.slug === prev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') ? slug : prev.slug,
    }));
  };

  const handleCreateTournament = async (e) => {
    e.preventDefault();
    setWizardSubmitting(true);
    setWizardError(null);
    try {
      const created = await organizerApi.createTournament({
        name: wizardForm.name,
        season: wizardForm.season,
        slug: wizardForm.slug || wizardForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: wizardForm.description || null,
        logo_url: wizardForm.logo_url || null,
        banner_url: wizardForm.banner_url || null,
        config: wizardForm.config,
      });
      closeDialog();
      setWizardStep(1);
      setWizardForm(freshWizard());
      setTab('overview');
      notifySuccess(`Competition "${created.name}" created successfully!`);
      await loadTournaments(created.id);
    } catch (err) {
      setWizardError(err.message || 'Failed to create tournament');
    } finally {
      setWizardSubmitting(false);
    }
  };

  // ---- Clubs and players
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
      closeDialog();
      setClubForm({ name: '', color: '#10B981', crest_url: '' });
      notifySuccess(`Club "${newTeam.name}" registered successfully!`);
      setTeams((await teamsApi.getTeams({ tournament_id: activeTournament.id })) || []);
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
      const updated = await teamsApi.getTeams({ tournament_id: activeTournament.id });
      setTeams(updated || []);
      if (selectedTeamId === teamId) setSelectedTeamId(updated?.[0]?.id || '');
    } catch (err) {
      setError(err.message || 'Failed to delete club');
    }
  };

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
      closeDialog();
      setPlayerForm({ name: '', number: '', is_manager: false, photo_url: '' });
      notifySuccess(`Player "${playerForm.name}" added to squad!`);
      await refreshPlayers();
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
      await refreshPlayers();
    } catch (err) {
      setError(err.message || 'Failed to remove player');
    }
  };

  // ---- Competition engine
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

  // ---- Schedule
  const openScheduleModal = (match) => {
    setSelectedMatchForSchedule(match);
    setScheduleForm({
      date: match.date || '',
      time: match.time || '',
      venue: match.venue || '',
      duration_minutes: match.duration_minutes || 40,
      label: match.label || '',
    });
    setDialog('schedule');
  };

  const handleUpdateSchedule = async (e) => {
    e.preventDefault();
    if (!selectedMatchForSchedule) return;
    try {
      await matchesApi.updateMatch(selectedMatchForSchedule.id, scheduleForm);
      closeDialog();
      notifySuccess(`Match #${selectedMatchForSchedule.match_number} schedule updated.`);
      await refreshMatches();
    } catch (err) {
      setError(err.message || 'Failed to update schedule');
    }
  };

  // ---- Scorers
  const handleCreateScorer = async (e) => {
    e.preventDefault();
    if (!scorerForm.username.trim() || !scorerForm.password.trim()) return;
    setScorerSubmitting(true);
    try {
      await organizerApi.createScorer(scorerForm.username.trim(), scorerForm.password.trim());
      closeDialog();
      setScorerForm({ username: '', password: '' });
      notifySuccess(`Scorer account "${scorerForm.username}" provisioned!`);
      await refreshScorers();
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
      await refreshScorers();
      await refreshMatches();
    } catch (err) {
      setError(err.message || 'Failed to delete scorer');
    }
  };

  const openAssignModal = (match) => {
    setSelectedMatchForAssign(match);
    setSelectedScorerIdToAssign(scorers[0]?.id || '');
    setDialog('assign');
  };

  const handleAssignScorer = async (e) => {
    e.preventDefault();
    if (!selectedMatchForAssign || !selectedScorerIdToAssign) return;
    try {
      await organizerApi.assignScorer(selectedMatchForAssign.id, selectedScorerIdToAssign);
      closeDialog();
      notifySuccess('Scorer assigned to match!');
      await refreshMatches();
    } catch (err) {
      setError(err.message || 'Failed to assign scorer');
    }
  };

  const handleUnassignScorer = async (matchId, scorerId) => {
    try {
      await organizerApi.removeScorer(matchId, scorerId);
      notifySuccess('Scorer unassigned from match.');
      await refreshMatches();
    } catch (err) {
      setError(err.message || 'Failed to unassign scorer');
    }
  };

  // ---- Danger zone
  const openDeleteModal = () => {
    setDeleteConfirmName('');
    setDialog('delete');
  };

  const handleDeleteTournament = async (e) => {
    e.preventDefault();
    if (deleteConfirmName !== activeTournament.name) {
      setError('Tournament name does not match confirmation.');
      return;
    }
    setDeleteSubmitting(true);
    try {
      await organizerApi.deleteTournament(activeTournament.id);
      closeDialog();
      setDeleteConfirmName('');
      setTab('overview');
      notifySuccess(`Tournament "${activeTournament.name}" completely deleted.`);
      await loadTournaments();
    } catch (err) {
      setError(err.message || 'Failed to delete tournament');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return {
    // data
    tournaments, activeTournament, selectedTournamentId, setSelectedTournamentId,
    teams, selectedTeam, selectedTeamId, setSelectedTeamId, players, groups, matches, scorers,
    loading, tabLoading, error, setError, successMsg,
    // navigation
    tab, setTab, dialog, setDialog, closeDialog,
    // wizard
    openWizard, wizardStep, setWizardStep, wizardSubmitting, wizardError, wizardForm, setWizardForm,
    handleWizardNameChange, handleCreateTournament,
    // clubs / players
    clubForm, setClubForm, clubSubmitting, handleCreateClub, handleDeleteClub,
    playerForm, setPlayerForm, playerSubmitting, handleCreatePlayer, handleDeletePlayer,
    // engine / schedule
    handleRandomDraw, handleGenerateFixtures, handleSeedKnockout,
    openScheduleModal, scheduleForm, setScheduleForm, selectedMatchForSchedule, handleUpdateSchedule,
    // scorers
    scorerForm, setScorerForm, scorerSubmitting, handleCreateScorer, handleDeleteScorer,
    openAssignModal, selectedMatchForAssign, selectedScorerIdToAssign, setSelectedScorerIdToAssign,
    handleAssignScorer, handleUnassignScorer,
    // danger zone
    openDeleteModal, deleteConfirmName, setDeleteConfirmName, deleteSubmitting, handleDeleteTournament,
  };
}

export default useOrganizerWorkspace;
