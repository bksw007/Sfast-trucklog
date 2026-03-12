import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { getAllUsers } from '../services/userService';
import { UserProfile } from '../types';

type AdminUsersContextValue = {
  users: UserProfile[];
  loading: boolean;
  error: string | null;
  refreshUsers: () => Promise<void>;
};

const AdminUsersContext = createContext<AdminUsersContextValue | undefined>(undefined);

export const AdminUsersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshUsers = async () => {
    if (!isAdmin) {
      setUsers([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await getAllUsers();
      setUsers(rows);
      setError(null);
    } catch (fetchError) {
      console.error('Failed to load admin users:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'load-users-failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshUsers();
  }, [isAdmin]);

  const value = useMemo(
    () => ({
      users,
      loading,
      error,
      refreshUsers,
    }),
    [error, loading, users]
  );

  return <AdminUsersContext.Provider value={value}>{children}</AdminUsersContext.Provider>;
};

export const useAdminUsers = (): AdminUsersContextValue => {
  const context = useContext(AdminUsersContext);
  if (!context) {
    throw new Error('useAdminUsers must be used within AdminUsersProvider');
  }
  return context;
};
