import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhoneNumberInput from '../PhoneNumberInput';

describe('PhoneNumberInput', () => {
  describe('empty state', () => {
    it('renders a country select and a national number input', () => {
      render(<PhoneNumberInput value="" onChange={vi.fn()} />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('has an unselected placeholder option by default when value is empty', () => {
      render(<PhoneNumberInput value="" onChange={vi.fn()} />);
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });

  describe('E.164 parsing on mount', () => {
    it('parses an existing E.164 value (+49176…) into the correct country and national number', () => {
      render(<PhoneNumberInput value="+491761234567" onChange={vi.fn()} />);
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('DE');
      const input = screen.getByRole('textbox') as HTMLInputElement;
      // National number without country code
      expect(input.value).toMatch(/1761234567/);
    });

    it('parses a US E.164 number into the US country option', () => {
      // +12025550173 is a valid US number (202 area code, Washington DC)
      render(<PhoneNumberInput value="+12025550173" onChange={vi.fn()} />);
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('US');
    });

    it('shows the raw value in the national input when the stored value cannot be parsed', () => {
      render(<PhoneNumberInput value="017621151336" onChange={vi.fn()} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('017621151336');
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });

  describe('emitting E.164 on interaction', () => {
    it('calls onChange with an E.164 string when country + national number are entered', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<PhoneNumberInput value="" onChange={onChange} />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'DE');

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, '1761234567');

      // The last call should produce the E.164 string
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string;
      expect(lastCall).toMatch(/^\+49/);
    });
  });

  describe('defaultCountry prop', () => {
    it('pre-selects the country when defaultCountry is provided and value is empty', () => {
      render(<PhoneNumberInput value="" onChange={vi.fn()} defaultCountry="US" />);
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('US');
    });
  });
});
