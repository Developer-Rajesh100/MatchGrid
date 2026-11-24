import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SuperadminDashboardPage } from './SuperadminDashboardPage';
import { superadminApi } from '../../api/superadmin';

vi.mock('../../api/superadmin', () => ({
  superadminApi: {
    getStats: vi.fn(),
    getUsers: vi.fn(),
    createOrganizer: vi.fn(),
    updateUserStatus: vi.fn(),
    deleteUser: vi.fn(),
    getTournaments: vi.fn(),
    deleteTournament: vi.fn(),
  },
}));

describe('SuperadminDashboardPage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockStats = {
    total_tournaments: 4,
    active_organizers: 2,
    total_scorers: 5,
    total_users: 8,
  };

  const mockUsers = [
    {
      id: 'u-1',
      username: 'root_superadmin',
      role: 'SUPER_ADMIN',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'u-2',
      username: 'org_alex',
      role: 'ORGANIZER',
      is_active: true,
      created_at: '2026-01-02T00:00:00Z',
    },
    {
      id: 'u-3',
      username: 'scorer_sam',
      role: 'SCORER',
      is_active: false,
      created_at: '2026-01-03T00:00:00Z',
    },
  ];

  const mockTournaments = [
    {
      id: 't-1',
      name: 'Champions Premier League',
      slug: 'champions-premier-league',
      season: '2026',
      stage: 'GROUP_STAGE',
      teams_count: 8,
      matches_count: 12,
    },
  ];

  it('renders stats, user directory, and tournaments table', async () => {
    superadminApi.getStats.mockResolvedValueOnce(mockStats);
    superadminApi.getUsers.mockResolvedValueOnce(mockUsers);
    superadminApi.getTournaments.mockResolvedValueOnce(mockTournaments);

    render(
      <MemoryRouter initialEntries={['/superadmin']}>
        <Routes>
          <Route path="/superadmin" element={<SuperadminDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Assert initial loading or rendered elements
    await waitFor(() => {
      expect(screen.getByTestId('superadmin-kpis')).toBeInTheDocument();
      expect(screen.getByTestId('superadmin-users-table')).toBeInTheDocument();
      expect(screen.getByTestId('superadmin-tournaments-table')).toBeInTheDocument();
    });

    expect(screen.getByText('Superadmin Command Center')).toBeInTheDocument();
    expect(screen.getByText('root_superadmin')).toBeInTheDocument();
    expect(screen.getByText('org_alex')).toBeInTheDocument();
    expect(screen.getByText('scorer_sam')).toBeInTheDocument();
    expect(screen.getByText('Champions Premier League')).toBeInTheDocument();
  });

  it('filters users by role selection', async () => {
    superadminApi.getStats.mockResolvedValueOnce(mockStats);
    superadminApi.getUsers.mockResolvedValueOnce(mockUsers);
    superadminApi.getTournaments.mockResolvedValueOnce(mockTournaments);

    render(
      <MemoryRouter initialEntries={['/superadmin']}>
        <Routes>
          <Route path="/superadmin" element={<SuperadminDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('superadmin-users-table')).toBeInTheDocument();
    });

    // Filter to ORGANIZER
    const filterSelect = screen.getByTestId('user-role-filter');
    fireEvent.change(filterSelect, { target: { value: 'ORGANIZER' } });

    expect(screen.getByText('org_alex')).toBeInTheDocument();
    expect(screen.queryByText('scorer_sam')).not.toBeInTheDocument();
    expect(screen.queryByText('root_superadmin')).not.toBeInTheDocument();
  });

  it('opens Create Organizer modal and provisions new organizer', async () => {
    superadminApi.getStats.mockResolvedValue(mockStats);
    superadminApi.getUsers.mockResolvedValue(mockUsers);
    superadminApi.getTournaments.mockResolvedValue(mockTournaments);
    superadminApi.createOrganizer.mockResolvedValueOnce({
      id: 'u-4',
      username: 'new_organizer',
      role: 'ORGANIZER',
      is_active: true,
    });

    render(
      <MemoryRouter initialEntries={['/superadmin']}>
        <Routes>
          <Route path="/superadmin" element={<SuperadminDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('create-organizer-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-organizer-btn'));
    expect(screen.getByTestId('create-organizer-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('org-username-input'), { target: { value: 'new_organizer' } });
    fireEvent.change(screen.getByTestId('org-password-input'), { target: { value: 'secretpass' } });
    fireEvent.click(screen.getByTestId('submit-organizer-btn'));

    await waitFor(() => {
      expect(superadminApi.createOrganizer).toHaveBeenCalled();
    });
  });

  it('toggles user active status', async () => {
    superadminApi.getStats.mockResolvedValue(mockStats);
    superadminApi.getUsers.mockResolvedValue(mockUsers);
    superadminApi.getTournaments.mockResolvedValue(mockTournaments);
    superadminApi.updateUserStatus.mockResolvedValueOnce({
      id: 'u-2',
      username: 'org_alex',
      role: 'ORGANIZER',
      is_active: false,
    });

    render(
      <MemoryRouter initialEntries={['/superadmin']}>
        <Routes>
          <Route path="/superadmin" element={<SuperadminDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('toggle-status-btn-u-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-status-btn-u-2'));

    await waitFor(() => {
      expect(superadminApi.updateUserStatus).toHaveBeenCalledWith('u-2', false);
    });
  });
});
