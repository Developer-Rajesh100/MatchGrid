import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../../api/auth';

export function RoleGuard({
  allowedRoles = ['SUPER_ADMIN', 'ORGANIZER'],
  children,
  fallbackPath = '/admin/login',
}) {
  const location = useLocation();

  if (!authApi.isAuthenticated()) {
    return <Navigate to={fallbackPath} replace state={{ from: location }} />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !authApi.hasRole(allowedRoles)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
