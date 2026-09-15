"use client";

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';

interface PermissionGuardProps {
  moduleId: string;
  action: 'read' | 'create' | 'write' | 'delete';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A wrapper component that only renders its children if the current admin 
 * has the specified permission for the given module.
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({ 
  moduleId, 
  action, 
  children, 
  fallback = null 
}) => {
  const { adminPermissions, isSuperAdmin, isLoading, isAdminLoading } = useAuth();

  // 1. While auth & permissions are loading, render loading spinner instead of crashing to null
  if (isLoading || isAdminLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground text-sm font-medium">
        <span className="animate-spin mr-2">⏳</span> Loading module permissions...
      </div>
    );
  }

  // 2. Super Admin always has all permissions
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // 3. If permissions haven't loaded yet or user is active admin, allow initial render
  if (!adminPermissions) {
    return <>{children}</>;
  }

  const hasPermission = hasActionPermission(adminPermissions, moduleId, action);

  if (hasPermission) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

export default PermissionGuard;
