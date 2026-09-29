import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../../api/auth';

export function RequireAdmin({ children }) {
  const location = useLocation();

  if (!authApi.isAuthenticated()) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return children;
}
