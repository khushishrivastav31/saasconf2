// Per-scope role rows we may render on the invite form. Each is gated by
// the matching module being enabled on the inviter's tenant (see filter in
// AddMemberModal) so we don't offer a Trainings role on a tenant that hasn't
// activated the Trainings module — Brandon's QA 0.5.1.6.
export const SCOPE_OPTIONS = [
  { scope: 'conferences' as const, label: 'Conferences', module: 'conferences' },
  { scope: 'trainings' as const, label: 'Trainings', module: 'trainings' },
  { scope: 'accounting' as const, label: 'Accounting', module: 'accounting' },
] as const;
