import type { Registration } from './RegistrationRow';
import type { OfferAttendeeItem } from './OfferAttendeeRow';

export interface TrainingGroup {
  placementId: string;
  programYearId: string | null;
  trainingName: string;
  trainingDate: string | null;
  isGuaranteed: boolean;
  isActive: boolean;
  trainerNames: string[];
  registrations: Registration[];
  offerAttendees: OfferAttendeeItem[];
  totalAttendees: number;
}

export interface Placement {
  placement_id: string;
  program_year_id?: string | null;
  training_name: string;
  training_date: string | null;
  is_guaranteed: boolean;
  is_active?: boolean;
  trainer_names?: string[];
}

export const formatTrainingDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '—';

export function buildGroups(
  items: Registration[],
  offerAtts: OfferAttendeeItem[],
  placements: Placement[]
): TrainingGroup[] {
  const map = new Map<string, TrainingGroup>();
  for (const reg of items) {
    const existing = map.get(reg.placement_id);
    if (existing) {
      existing.registrations.push(reg);
      existing.totalAttendees += reg.attendee_count;
    } else {
      map.set(reg.placement_id, {
        placementId: reg.placement_id,
        programYearId: reg.program_year_id ?? null,
        trainingName: reg.training_name,
        trainingDate: reg.training_date,
        isGuaranteed: reg.is_guaranteed,
        isActive: reg.is_active ?? true,
        trainerNames: reg.trainer_names ?? [],
        registrations: [reg],
        offerAttendees: [],
        totalAttendees: reg.attendee_count,
      });
    }
  }
  for (const oa of offerAtts) {
    const existing = map.get(oa.placement_id);
    if (existing) {
      existing.offerAttendees.push(oa);
      existing.totalAttendees += 1;
      if (existing.trainerNames.length === 0 && oa.trainer_names?.length) {
        existing.trainerNames = oa.trainer_names;
      }
    } else {
      map.set(oa.placement_id, {
        placementId: oa.placement_id,
        programYearId: oa.program_year_id ?? null,
        trainingName: oa.training_name,
        trainingDate: oa.training_date,
        isGuaranteed: oa.is_guaranteed,
        isActive: oa.is_active ?? true,
        trainerNames: oa.trainer_names ?? [],
        registrations: [],
        offerAttendees: [oa],
        totalAttendees: 1,
      });
    }
  }
  for (const pl of placements) {
    const existing = map.get(pl.placement_id);
    if (existing) {
      if (existing.trainerNames.length === 0 && pl.trainer_names?.length) {
        existing.trainerNames = pl.trainer_names;
      }
      continue;
    }
    map.set(pl.placement_id, {
      placementId: pl.placement_id,
      programYearId: pl.program_year_id ?? null,
      trainingName: pl.training_name,
      trainingDate: pl.training_date,
      isGuaranteed: pl.is_guaranteed,
      isActive: pl.is_active ?? true,
      trainerNames: pl.trainer_names ?? [],
      registrations: [],
      offerAttendees: [],
      totalAttendees: 0,
    });
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (!a.trainingDate && !b.trainingDate) return 0;
    if (!a.trainingDate) return 1;
    if (!b.trainingDate) return -1;
    return a.trainingDate.localeCompare(b.trainingDate);
  });
  return groups;
}
