import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { clearTokens, setTokens, getAccessToken } from '../config/api';
import type { User, LoginRequest, TokenResponse } from '../types';
import { ThemeContext } from './ThemeContext';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const themeCtx = useContext(ThemeContext);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get<User>('/auth/me');
      setUser(response.data);
      themeCtx?.syncFromServer(response.data.theme_preference);
    } catch {
      setUser(null);
      clearTokens();
    }
  }, [themeCtx]);

  const refreshUser = useCallback(async () => {
    await fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const initAuth = async () => {
      const token = getAccessToken();
      if (token) {
        await fetchUser();
      }
      setIsLoading(false);
    };

    initAuth();
  }, [fetchUser]);

  const login = async (credentials: LoginRequest) => {
    // Clear any cached data from previous user session
    queryClient.clear();
    const response = await api.post<TokenResponse>('/auth/login', credentials);
    const { access_token, refresh_token } = response.data;
    setTokens(access_token, refresh_token);
    await fetchUser();
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearTokens();
      setUser(null);
      // Clear all cached queries to prevent stale data when switching users
      queryClient.clear();
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
