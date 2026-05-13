import { useQuery } from '@tanstack/react-query';
import api from '../config/api';
import type { Tenant } from '../types';

interface AccountingEmailStatus {
  isConfigured: boolean;
  isLoading: boolean;
  email: string | null;
}

/**
 * Returns whether the tenant's accounting_email is configured.
 *
 * The backend refuses to send invoice or credit-note emails when
 * ``tenants.accounting_email`` is unset and surfaces the failure as a
 * 422 with the message "Set Accounting Email on My Company...". Brandon
 * (QA 4.1.5) noted that admins discover this only at the moment they
 * try to Send — too late and confusing. UIs that present a Send button
 * should call this hook and render a heads-up banner when
 * ``isConfigured`` is false.
 */
export function useMyCompanyAccountingEmail(): AccountingEmailStatus {
  const { data, isLoading } = useQuery<Tenant>({
    queryKey: ['my-company'],
    queryFn: async () => {
      const res = await api.get<Tenant>('/my-company');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const email = data?.accounting_email ?? null;
  return {
    isConfigured: !!email && email.trim() !== '',
    isLoading,
    email,
  };
}
