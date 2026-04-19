import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ThemeContext } from './ThemeContext';
import portalApi, {
  clearApplicantTokens,
  getApplicantAccessToken,
  setApplicantTokens,
} from '../config/portalApi';
import type {
  ApplicantProfile,
  ApplicantLoginRequest,
  ApplicantRegisterRequest,
  ApplicantTokenResponse,
  PortalMe,
} from '../types/portal';

interface ApplicantAuthContextType {
  applicant: ApplicantProfile | null;
  portalMe: PortalMe | null;
  isLoading: boolean;
  tenantSlug: string;
  login: (credentials: ApplicantLoginRequest) => Promise<PortalMe>;
  register: (data: ApplicantRegisterRequest) => Promise<string>;
  logout: () => void;
  refreshApplicant: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ApplicantAuthContext = createContext<ApplicantAuthContextType | null>(null);

export function ApplicantAuthProvider({ children }: { children: React.ReactNode }) {
  const [applicant, setApplicant] = useState<ApplicantProfile | null>(null);
  const [portalMe, setPortalMe] = useState<PortalMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const themeCtx = useContext(ThemeContext);
  const themeCtxRef = useRef(themeCtx);
  themeCtxRef.current = themeCtx;

  const { companySlug } = useParams<{ companySlug: string }>();
  const slug = companySlug || '';

  const fetchApplicant = useCallback(async (): Promise<PortalMe | null> => {
    try {
      const meRes = await portalApi.get<PortalMe>('/portal/unified/me');
      const me = meRes.data;
      setPortalMe(me);
      themeCtxRef.current?.syncFromServer(me.theme_preference);

      if (me.has_conference_account) {
        const applicantRes = await portalApi.get<ApplicantProfile>('/portal/me');
        setApplicant(applicantRes.data);
      } else {
        setApplicant(null);
      }
      return me;
    } catch {
      setApplicant(null);
      setPortalMe(null);
      clearApplicantTokens();
      return null;
    }
  }, []);

  const refreshApplicant = useCallback(async () => {
    await fetchApplicant();
  }, [fetchApplicant]);

  useEffect(() => {
    const initAuth = async () => {
      const token = getApplicantAccessToken();
      if (token) {
        await fetchApplicant();
      }
      setIsLoading(false);
    };

    initAuth();
  }, [fetchApplicant]);

  const login = async (credentials: ApplicantLoginRequest): Promise<PortalMe> => {
    const response = await portalApi.post<ApplicantTokenResponse>(
      `/portal/${slug}/unified/login`,
      credentials
    );
    const { access_token, refresh_token } = response.data;
    setApplicantTokens(access_token, refresh_token);
    queryClient.clear();
    const me = await fetchApplicant();
    if (!me) {
      throw new Error('Failed to load portal profile after login');
    }
    return me;
  };

  const register = async (data: ApplicantRegisterRequest): Promise<string> => {
    const response = await portalApi.post<{ message: string }>(`/portal/${slug}/register`, data);
    return response.data.message;
  };

  const logout = () => {
    clearApplicantTokens();
    setApplicant(null);
    setPortalMe(null);
    queryClient.clear();
  };

  return (
    <ApplicantAuthContext.Provider
      value={{
        applicant,
        portalMe,
        isLoading,
        tenantSlug: slug,
        login,
        register,
        logout,
        refreshApplicant,
      }}
    >
      {children}
    </ApplicantAuthContext.Provider>
  );
}
