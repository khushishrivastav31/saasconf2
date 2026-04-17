import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../../config/api';
import type {
  Applicant,
  CallForPapers,
  CFPTopic,
  SessionType,
  PaperFormSchema,
} from '../../../../../types';
import type { PaperAssignmentListResponse } from '../../../../../types/review';
import { BUILTIN_FIELD_DEFS, type UnifiedFormField } from './schema';

interface ApplicantListResponse {
  items: Applicant[];
  total: number;
}

interface CFPListResponse {
  items: CallForPapers[];
  total: number;
}

interface TopicListResponse {
  items: CFPTopic[];
  total: number;
}

interface SessionTypeListResponse {
  items: SessionType[];
  total: number;
}

export function usePaperFormData({
  conferenceId,
  paperId,
  fallbackCfpId,
}: {
  conferenceId: string;
  paperId: string | null;
  fallbackCfpId?: string;
}) {
  const { data: cfpsData, error: cfpQueryError } = useQuery({
    queryKey: ['cfp-list', conferenceId],
    queryFn: async () => {
      const response = await api.get<CFPListResponse>(`/conferences/${conferenceId}/cfps`);
      return response.data;
    },
    enabled: !!conferenceId,
    retry: 2,
  });

  const conferenceCfpId = cfpsData?.items?.[0]?.id || fallbackCfpId || '';

  useEffect(() => {
    if (cfpQueryError) {
      console.error(
        '[PaperForm] Failed to fetch CFPs for conference:',
        conferenceId,
        cfpQueryError
      );
    }
  }, [cfpQueryError, conferenceId]);

  const { data: applicantsData } = useQuery({
    queryKey: ['cfp-applicants'],
    queryFn: async () => {
      const response = await api.get<ApplicantListResponse>('/cfp/applicants');
      return response.data;
    },
  });

  const { data: topicsData } = useQuery({
    queryKey: ['cfp-topics'],
    queryFn: async () => {
      const response = await api.get<TopicListResponse>('/cfp/topics');
      return response.data;
    },
  });

  const { data: sessionTypesData } = useQuery({
    queryKey: ['session-types', conferenceId],
    queryFn: async () => {
      const response = await api.get<SessionTypeListResponse>(
        `/conferences/${conferenceId}/settings/session-types`
      );
      return response.data;
    },
  });

  const { data: assignmentsData } = useQuery({
    queryKey: ['paper-assignments', paperId],
    queryFn: async () => {
      const response = await api.get<PaperAssignmentListResponse>(
        `/cfp/papers/${paperId}/assignments`
      );
      return response.data;
    },
    enabled: !!paperId,
  });

  const { data: formSchemaData } = useQuery({
    queryKey: ['paper-form-schema', conferenceId],
    queryFn: async () => {
      const res = await api.get<PaperFormSchema>(`/conferences/${conferenceId}/paper-form-schema`);
      return res.data;
    },
    staleTime: 60_000,
  });

  const unifiedFormFields = useMemo((): UnifiedFormField[] => {
    const builtinConfig = formSchemaData?.builtin_fields_config ?? {};
    const customFieldsList = formSchemaData?.fields ?? [];
    const builtinCount = BUILTIN_FIELD_DEFS.length;

    const builtinFields: UnifiedFormField[] = BUILTIN_FIELD_DEFS.map((bf, defaultIdx) => {
      const config = builtinConfig[bf.key];
      return {
        type: 'builtin' as const,
        key: bf.key,
        label: bf.label,
        display_order: config?.display_order ?? defaultIdx,
        is_visible: config?.visible !== false,
        is_required: bf.alwaysRequired || config?.required || false,
        help_text: config?.help_text,
        min_chars: config?.min_chars,
        max_chars: config?.max_chars,
        options: config?.options,
      };
    });

    const customFields: UnifiedFormField[] = customFieldsList
      .filter((f) => f.is_visible)
      .map((f) => {
        const unifiedOrderingInUse = Object.values(builtinConfig).some(
          (c) => c.display_order !== undefined && c.display_order !== null
        );
        const order = unifiedOrderingInUse ? f.display_order : f.display_order + builtinCount;

        return {
          type: 'custom' as const,
          key: f.field_key,
          label: f.label,
          display_order: order,
          is_visible: f.is_visible,
          is_required: f.is_required,
          customField: f,
        };
      });

    return [...builtinFields, ...customFields]
      .filter((f) => f.is_visible)
      .sort((a, b) => a.display_order - b.display_order);
  }, [formSchemaData]);

  const applicants = useMemo(() => applicantsData?.items || [], [applicantsData?.items]);
  const topics = useMemo(() => topicsData?.items || [], [topicsData?.items]);
  const sessionTypes = useMemo(() => {
    return (sessionTypesData?.items || []).filter((st) => st.cfp_eligible && st.is_active);
  }, [sessionTypesData?.items]);
  const assignments = assignmentsData?.items || [];

  return {
    applicants,
    topics,
    sessionTypes,
    assignments,
    conferenceCfpId,
    unifiedFormFields,
  };
}
