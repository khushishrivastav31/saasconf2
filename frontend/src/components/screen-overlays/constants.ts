import type { OverlayTriggerType, OverlayAnimationStyle, ScreenOverlayCreate } from '../../types';

export const TRIGGER_OPTIONS: { value: OverlayTriggerType; label: string }[] = [
  { value: 'first_registration', label: 'First Registration' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'always', label: 'Always' },
];

export const ANIMATION_OPTIONS: { value: OverlayAnimationStyle; label: string }[] = [
  { value: 'confetti', label: 'Confetti' },
  { value: 'fireworks', label: 'Fireworks' },
  { value: 'balloons', label: 'Balloons' },
  { value: 'sparkle', label: 'Sparkle' },
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'snow', label: 'Snow' },
  { value: 'stars', label: 'Stars' },
];

export const triggerBadgeClass: Record<OverlayTriggerType, string> = {
  first_registration: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  scheduled: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  always: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
};

export function emptyForm(): ScreenOverlayCreate {
  return {
    trigger_type: 'first_registration',
    title: '',
    body_text: '',
    animation_style: 'confetti',
    duration_seconds: 5,
    is_active: false,
    schedule_date: undefined,
    display_order: 0,
  };
}
