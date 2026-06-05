import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { clearTokens, setTokens, getAccessToken } from '../config/api';
import type { User, LoginRequest, TokenResponse, MFALoginResponse } from '../types';
import { ThemeContext } from './ThemeContext';

// eslint-disable-next-line react-refresh/only-export-components
export class MFARequiredError extends Error {
  mfaToken: string;
  constructor(mfaToken: string) {
    super('MFA required');
    this.mfaToken = mfaToken;
  }
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  verifyMFA: (mfaToken: string, code: string) => Promise<void>;
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

  // Keep a stable ref to syncFromServer so fetchUser doesn't depend on themeCtx.
  // Without this, every theme toggle re-creates fetchUser → re-fires the
  // useEffect → GET /auth/me returns the OLD preference → double flash.
  const syncThemeRef = useRef(themeCtx?.syncFromServer);
  useEffect(() => {
    syncThemeRef.current = themeCtx?.syncFromServer;
  }, [themeCtx?.syncFromServer]);

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get<User>('/auth/me');
      setUser(response.data);
      syncThemeRef.current?.(response.data.theme_preference);
    } catch {
      setUser(null);
      clearTokens();
    }
  }, []);

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

  const clearDeadlineToastKeys = () => {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith('deadline_toast_shown:'))
      .forEach((k) => sessionStorage.removeItem(k));
  };

  const login = async (credentials: LoginRequest) => {
    // Clear any cached data from previous user session
    queryClient.clear();
    clearDeadlineToastKeys();
    const response = await api.post<TokenResponse | MFALoginResponse>('/auth/login', credentials);

    // Check if MFA is required
    if ('mfa_required' in response.data && response.data.mfa_required) {
      throw new MFARequiredError((response.data as MFALoginResponse).mfa_token);
    }

    const { access_token, refresh_token } = response.data as TokenResponse;
    setTokens(access_token, refresh_token);
    await fetchUser();
  };

  const verifyMFA = async (mfaToken: string, code: string) => {
    const response = await api.post<TokenResponse>('/auth/mfa/verify-login', {
      mfa_token: mfaToken,
      code,
    });
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
      clearDeadlineToastKeys();
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, verifyMFA, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
