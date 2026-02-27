import { useQuery } from '@tanstack/react-query';
import api from '../config/api';
import type { ScreenOverlay } from '../types';

interface OverlaySelectorProps {
  conferenceId: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  label?: string;
}

const triggerLabel: Record<string, string> = {
  first_registration: 'First Reg',
  scheduled: 'Scheduled',
  always: 'Always',
};

export default function OverlaySelector({
  conferenceId,
  value,
  onChange,
  label = 'Screen Overlay',
}: OverlaySelectorProps) {
  const { data } = useQuery({
    queryKey: ['conference-screen-overlays', conferenceId],
    queryFn: async () => {
      const res = await api.get<{ items: ScreenOverlay[]; total: number }>(
        `/conferences/${conferenceId}/screen-overlays`
      );
      return res.data;
    },
    enabled: !!conferenceId,
  });

  const overlays = data?.items ?? [];

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <select
        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">No overlay</option>
        {overlays.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title} ({triggerLabel[o.trigger_type] ?? o.trigger_type})
          </option>
        ))}
      </select>
    </div>
  );
}
