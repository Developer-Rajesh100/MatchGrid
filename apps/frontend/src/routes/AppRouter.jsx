import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PublicHubPage } from '../pages/hub/PublicHubPage';
import { TournamentLayout } from '../pages/tournament/TournamentLayout';
import { TournamentOverviewPage } from '../pages/tournament/TournamentOverviewPage';
import { BracketPage } from '../pages/tournament/BracketPage';
import { HomePage } from '../pages/HomePage';
import { MatchesPage } from '../pages/MatchesPage';
import { MatchDetailPage } from '../pages/MatchDetailPage';
import { StandingsPage } from '../pages/StandingsPage';
import { StatsPage } from '../pages/StatsPage';
import { TeamsPage } from '../pages/TeamsPage';
import { TeamDetailPage } from '../pages/TeamDetailPage';
import { PlayersPage } from '../pages/PlayersPage';
import { PlayerDetailPage } from '../pages/PlayerDetailPage';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';
import { UnifiedLoginPage } from '../pages/auth/UnifiedLoginPage';
import { SuperadminDashboardPage } from '../pages/superadmin/SuperadminDashboardPage';
import { OrganizerWorkspacePage } from '../pages/organizer/OrganizerWorkspacePage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminLiveControlPage } from '../pages/admin/AdminLiveControlPage';
import { ScorerDashboardPage } from '../pages/scorer/ScorerDashboardPage';
import { RequireAdmin } from '../components/common/RequireAdmin';
import { RoleGuard } from '../components/common/RoleGuard';

export function AppRouter() {
  return (
    <Routes>
      {/* Tier 1 Public Tournament Hub */}
      <Route path="/" element={<PublicHubPage />} />

      {/* Tier 2 Tournament Center Shell */}
      <Route path="/t/:slug" element={<TournamentLayout />}>
        <Route index element={<TournamentOverviewPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="standings" element={<StandingsPage />} />
        <Route path="bracket" element={<BracketPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="stats" element={<StatsPage />} />
      </Route>

      {/* Top-Level Public Legacy Routes (Default Tournament Scoped) */}
      <Route path="/matches" element={<MatchesPage />} />
      <Route path="/matches/:matchId" element={<MatchDetailPage />} />
      <Route path="/standings" element={<StandingsPage />} />
      <Route path="/stats" element={<StatsPage />} />
      <Route path="/teams" element={<TeamsPage />} />
      <Route path="/teams/:teamId" element={<TeamDetailPage />} />
      <Route path="/players" element={<PlayersPage />} />
      <Route path="/players/:playerId" element={<PlayerDetailPage />} />

      {/* Authentication */}
      <Route path="/login" element={<UnifiedLoginPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/* Role-Based Portals */}
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

      {/* Legacy Admin Routes (Maintained for Backward Compatibility) */}
      <Route
        path="/admin"
        element={
          <RoleGuard allowedRoles={['SUPER_ADMIN', 'ORGANIZER']}>
            <AdminDashboardPage />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/matches/:matchId/live"
        element={
          <RoleGuard allowedRoles={['SUPER_ADMIN', 'ORGANIZER', 'SCORER']}>
            <AdminLiveControlPage />
          </RoleGuard>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
