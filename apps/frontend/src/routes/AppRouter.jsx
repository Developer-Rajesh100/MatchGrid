import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { PublicHubPage } from '../pages/hub/PublicHubPage';
import { TournamentLayout } from '../pages/tournament/TournamentLayout';
import { TournamentOverviewPage } from '../pages/tournament/TournamentOverviewPage';
import { BracketPage } from '../pages/tournament/BracketPage';
import { MatchesPage } from '../pages/MatchesPage';
import { MatchDetailPage } from '../pages/MatchDetailPage';
import { StandingsPage } from '../pages/StandingsPage';
import { StatsPage } from '../pages/StatsPage';
import { TeamsPage } from '../pages/TeamsPage';
import { TeamDetailPage } from '../pages/TeamDetailPage';
import { PlayersPage } from '../pages/PlayersPage';
import { PlayerDetailPage } from '../pages/PlayerDetailPage';
import { UnifiedLoginPage } from '../pages/auth/UnifiedLoginPage';
import { SuperadminDashboardPage } from '../pages/superadmin/SuperadminDashboardPage';
import { OrganizerWorkspacePage } from '../pages/organizer/OrganizerWorkspacePage';
import { AdminLiveControlPage } from '../pages/admin/AdminLiveControlPage';
import { ScorerDashboardPage } from '../pages/scorer/ScorerDashboardPage';
import { RoleGuard } from '../components/common/RoleGuard';
import { LoadingState } from '../components/common/Common';
import { matchesApi } from '../api/matches';
import { teamsApi } from '../api/teams';
import { playersApi } from '../api/players';
import { tournamentApi } from '../api/tournament';
import { tPath } from '../utils/paths';

// Old shared links (/matches/:id, /teams/:id, /players/:id) carry no tournament: look the entity up,
// find its tournament, and send the visitor to the tournament-scoped page.
const LEGACY_LOOKUPS = {
  match: async (id) => {
    const match = await matchesApi.getMatch(id);
    return { slug: match.tournament_slug, rest: `matches/${id}` };
  },
  team: async (id) => {
    const team = await teamsApi.getTeam(id);
    return { tournamentId: team.tournament_id, rest: `teams/${id}` };
  },
  player: async (id) => {
    const player = await playersApi.getPlayer(id);
    return { tournamentId: player.tournament_id, rest: `players/${id}` };
  },
};

function LegacyEntityRedirect({ kind }) {
  const params = useParams();
  const id = params.matchId || params.teamId || params.playerId;
  const [target, setTarget] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await LEGACY_LOOKUPS[kind](id);
        const slug = found.slug || (await tournamentApi.getTournamentById(found.tournamentId)).slug;
        if (!cancelled) setTarget(tPath(slug, found.rest));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  if (failed) return <Navigate to="/" replace />;
  if (!target) return <LoadingState message="Redirecting..." />;
  return <Navigate to={target} replace />;
}

function LegacyLiveRedirect() {
  const { matchId } = useParams();
  return <Navigate to={`/scorer/matches/${matchId}/live`} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      {/* Tier 1: public tournament hub */}
      <Route path="/" element={<PublicHubPage />} />

      {/* Tier 2: tournament center. Every public page for a tournament lives here. */}
      <Route path="/t/:slug" element={<TournamentLayout />}>
        <Route index element={<TournamentOverviewPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="matches/:matchId" element={<MatchDetailPage />} />
        <Route path="standings" element={<StandingsPage />} />
        <Route path="bracket" element={<BracketPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/:teamId" element={<TeamDetailPage />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="players/:playerId" element={<PlayerDetailPage />} />
        <Route path="stats" element={<StatsPage />} />
      </Route>

      {/* Legacy single-tournament URLs: lists have no tournament to show, details redirect to theirs */}
      {['matches', 'standings', 'stats', 'teams', 'players'].map((path) => (
        <Route key={path} path={`/${path}`} element={<Navigate to="/" replace />} />
      ))}
      <Route path="/matches/:matchId" element={<LegacyEntityRedirect kind="match" />} />
      <Route path="/teams/:teamId" element={<LegacyEntityRedirect kind="team" />} />
      <Route path="/players/:playerId" element={<LegacyEntityRedirect kind="player" />} />

      {/* Authentication */}
      <Route path="/login" element={<UnifiedLoginPage />} />
      <Route path="/admin/login" element={<Navigate to="/login" replace />} />

      {/* Role portals */}
      <Route
        path="/superadmin"
        element={
          <RoleGuard allowedRoles={['SUPER_ADMIN']}>
            <SuperadminDashboardPage />
          </RoleGuard>
        }
      />
      <Route
        path="/organizer"
        element={
          <RoleGuard allowedRoles={['SUPER_ADMIN', 'ORGANIZER']}>
            <OrganizerWorkspacePage />
          </RoleGuard>
        }
      />
      <Route
        path="/scorer"
        element={
          <RoleGuard allowedRoles={['SUPER_ADMIN', 'ORGANIZER', 'SCORER']}>
            <ScorerDashboardPage />
          </RoleGuard>
        }
      />
      <Route
        path="/scorer/matches/:matchId/live"
        element={
          <RoleGuard allowedRoles={['SUPER_ADMIN', 'ORGANIZER', 'SCORER']}>
            <AdminLiveControlPage />
          </RoleGuard>
        }
      />

      {/* The old /admin area is the organizer workspace now */}
      <Route path="/admin" element={<Navigate to="/organizer" replace />} />
      <Route path="/admin/matches/:matchId/live" element={<LegacyLiveRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
