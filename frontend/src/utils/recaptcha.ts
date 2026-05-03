/**
 * Shared reCAPTCHA v3 site-key resolver.
 *
 * One key per project on the reCAPTCHA Admin Console
 * (https://www.google.com/recaptcha/admin) — the same key powers all three
 * public registration portals (conference, training, CFP applicant signup).
 *
 * Empty string in dev/test means "no captcha"; both the provider mount and
 * the per-form `executeRecaptcha` calls short-circuit when disabled, and
 * the backend's `validate_recaptcha` no-ops when its matching secret is
 * unset, so the system remains fully functional without keys.
 */
export const RECAPTCHA_SITE_KEY: string = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';

export const RECAPTCHA_ENABLED: boolean = Boolean(RECAPTCHA_SITE_KEY);
