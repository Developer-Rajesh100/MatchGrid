import React from 'react';
import { RoleGuard } from './RoleGuard';

export function RequireAdmin({ children }) {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ORGANIZER']}>
      {children}
    </RoleGuard>
  );
}
