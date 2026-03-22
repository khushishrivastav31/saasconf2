import { useState } from 'react';
import publicApi from '../../../config/publicApi';
import type { DiscountCodeValidation } from '../../../types/publicRegistration';

interface UseDiscountCodeReturn {
  discountValidation: DiscountCodeValidation | null;
  discountLoading: boolean;
  discountMessage: string | null;
  setDiscountMessage: (msg: string | null) => void;
  validateDiscountCode: (code: string) => Promise<void>;
}

export function useDiscountCode(tenantSlug: string, conferenceSlug: string): UseDiscountCodeReturn {
  const [discountValidation, setDiscountValidation] = useState<DiscountCodeValidation | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);

  const validateDiscountCode = async (code: string) => {
    if (!code || code.trim() === '') {
      setDiscountValidation(null);
      setDiscountMessage(null);
      return;
    }

    setDiscountLoading(true);
    setDiscountMessage(null);

    try {
      const response = await publicApi.get<DiscountCodeValidation>(
        `/portal/${tenantSlug}/conferences/${conferenceSlug}/validate-discount/${encodeURIComponent(code.trim())}`
      );

      setDiscountValidation(response.data);

      if (response.data.valid) {
        setDiscountMessage(`✓ Discount applied: ${response.data.description || 'Valid code'}`);
      } else {
        setDiscountMessage(`✗ ${response.data.message || 'Invalid code'}`);
      }
    } catch {
      setDiscountValidation(null);
      setDiscountMessage('✗ Error validating discount code');
    } finally {
      setDiscountLoading(false);
    }
  };

  return {
    discountValidation,
    discountLoading,
    discountMessage,
    setDiscountMessage,
    validateDiscountCode,
  };
}
