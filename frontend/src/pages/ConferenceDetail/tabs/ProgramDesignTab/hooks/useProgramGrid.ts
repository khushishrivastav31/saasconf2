import { useQuery } from "@tanstack/react-query";
import api from "../../../../../config/api";
import type {
  ProgramDay,
  ProgramGrid,
} from "../../../../../types";

interface UseProgramDaysOptions {
  conferenceId: string;
  enabled?: boolean;
}

export function useProgramDays({ conferenceId, enabled = true }: UseProgramDaysOptions) {
  return useQuery({
    queryKey: ["program-days", conferenceId],
    queryFn: async () => {
      const response = await api.get<{ items: ProgramDay[]; total: number }>(
        `/conferences/${conferenceId}/program/days`
      );
      return response.data;
    },
    enabled,
  });
}

interface UseProgramGridOptions {
  conferenceId: string;
  dayId: string | null;
  enabled?: boolean;
}

export function useProgramGrid({ conferenceId, dayId, enabled = true }: UseProgramGridOptions) {
  return useQuery({
    queryKey: ["program-grid", conferenceId, dayId],
    queryFn: async () => {
      const response = await api.get<ProgramGrid>(
        `/conferences/${conferenceId}/program/grid/${dayId}`
      );
      return response.data;
    },
    enabled: enabled && !!dayId,
  });
}
