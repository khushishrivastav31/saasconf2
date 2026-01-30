import { createContext, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import portalApi, {
  clearApplicantTokens,
  getApplicantAccessToken,
  setApplicantTokens,
} from "../config/portalApi";
import type {
  ApplicantProfile,
  ApplicantLoginRequest,
  ApplicantRegisterRequest,
  ApplicantTokenResponse,
} from "../types/portal";

interface ApplicantAuthContextType {
  applicant: ApplicantProfile | null;
  isLoading: boolean;
  tenantSlug: string;
  login: (credentials: ApplicantLoginRequest) => Promise<void>;
  register: (data: ApplicantRegisterRequest) => Promise<string>;
  logout: () => void;
  refreshApplicant: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ApplicantAuthContext =
  createContext<ApplicantAuthContextType | null>(null);

export function ApplicantAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [applicant, setApplicant] = useState<ApplicantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const { companySlug } = useParams<{ companySlug: string }>();
  const slug = companySlug || "";

  const fetchApplicant = useCallback(async () => {
    try {
      const response = await portalApi.get<ApplicantProfile>("/portal/me");
      setApplicant(response.data);
    } catch {
      setApplicant(null);
      clearApplicantTokens();
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

  const login = async (credentials: ApplicantLoginRequest) => {
    const response = await portalApi.post<ApplicantTokenResponse>(
      `/portal/${slug}/login`,
      credentials,
    );
    const { access_token, refresh_token } = response.data;
    setApplicantTokens(access_token, refresh_token);
    queryClient.clear();
    await fetchApplicant();
  };

  const register = async (data: ApplicantRegisterRequest): Promise<string> => {
    const response = await portalApi.post<{ message: string }>(
      `/portal/${slug}/register`,
      data,
    );
    return response.data.message;
  };

  const logout = () => {
    clearApplicantTokens();
    setApplicant(null);
    queryClient.clear();
  };

  return (
    <ApplicantAuthContext.Provider
      value={{
        applicant,
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
