import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AddressFields from '../AddressFields';

const noop = () => {};

const defaultProps = {
  addressLine1: '',
  addressLine2: '',
  city: '',
  postalCode: '',
  country: '',
  onAddressLine1Change: noop,
  onAddressLine2Change: noop,
  onCityChange: noop,
  onPostalCodeChange: noop,
  onCountryChange: noop,
};

describe('AddressFields', () => {
  describe('without requiredFields', () => {
    it('renders all address labels without required asterisks', () => {
      render(<AddressFields {...defaultProps} />);
      // No asterisk text anywhere
      expect(screen.queryByText('*')).not.toBeInTheDocument();
    });
  });

  describe('with requiredFields including address', () => {
    it('renders an asterisk on Address Line 1 label', () => {
      render(<AddressFields {...defaultProps} requiredFields={['address']} />);
      const line1Label = screen.getByText(/address line 1/i).closest('label');
      expect(line1Label).toHaveTextContent('*');
    });

    it('renders an asterisk on City label', () => {
      render(<AddressFields {...defaultProps} requiredFields={['address']} />);
      const cityLabel = screen.getByText(/^city$/i).closest('label');
      expect(cityLabel).toHaveTextContent('*');
    });

    it('renders an asterisk on Postal Code label', () => {
      render(<AddressFields {...defaultProps} requiredFields={['address']} />);
      const postalLabel = screen.getByText(/postal code/i).closest('label');
      expect(postalLabel).toHaveTextContent('*');
    });

    it('renders an asterisk on Country label', () => {
      render(<AddressFields {...defaultProps} requiredFields={['address']} />);
      const countryLabel = screen.getByText(/^country$/i).closest('label');
      expect(countryLabel).toHaveTextContent('*');
    });

    it('does NOT render an asterisk on Address Line 2 (always optional)', () => {
      render(<AddressFields {...defaultProps} requiredFields={['address']} />);
      const line2Label = screen.getByText(/address line 2/i).closest('label');
      expect(line2Label).not.toHaveTextContent('*');
    });
  });

  describe('with requiredFields NOT including address', () => {
    it('renders no asterisks when address is not in requiredFields', () => {
      render(<AddressFields {...defaultProps} requiredFields={['bio', 'phone']} />);
      expect(screen.queryByText('*')).not.toBeInTheDocument();
    });
  });
});
