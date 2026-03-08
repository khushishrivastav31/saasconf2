/**
 * reCAPTCHA v3 Hook
 *
 * Provides executeRecaptcha function for generating tokens.
 */
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

export function useRecaptcha() {
  const { executeRecaptcha } = useGoogleReCaptcha();

  const getToken = async (action = 'submit'): Promise<string> => {
    if (!executeRecaptcha) {
      console.warn('reCAPTCHA not loaded yet');
      return 'recaptcha-not-loaded';
    }

    try {
      const token = await executeRecaptcha(action);
      return token;
    } catch (error) {
      console.error('reCAPTCHA execution failed:', error);
      return 'recaptcha-error';
    }
  };

  return { getToken };
}
