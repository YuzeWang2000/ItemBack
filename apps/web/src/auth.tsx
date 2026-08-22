import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, ApiError } from './api';

interface User {
  id: string;
  email: string;
}
interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  return (
    <AuthContext.Provider
      value={{
        user: me.data ?? null,
        loading: me.isLoading,
        login: async (email, password) => {
          const result = await api<{ user: User }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          client.setQueryData(['me'], result.user);
        },
        logout: async () => {
          await api('/auth/logout', { method: 'POST' });
          client.setQueryData(['me'], null);
          client.clear();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used in AuthProvider');
  return value;
}
