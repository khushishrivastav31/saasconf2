import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DataRightsPanel from '../DataRightsPanel';

describe('DataRightsPanel', () => {
  it('renders all six GDPR rights', () => {
    render(<DataRightsPanel />);
    expect(screen.getByText(/Access your data/)).toBeInTheDocument();
    expect(screen.getByText(/Correct your data/)).toBeInTheDocument();
    expect(screen.getByText(/Delete your data/)).toBeInTheDocument();
    expect(screen.getByText(/Portable export/)).toBeInTheDocument();
    expect(screen.getByText(/Object to processing/)).toBeInTheDocument();
    expect(screen.getByText(/Complain to a supervisory authority/)).toBeInTheDocument();
  });

  it('mentions the one-month response window', () => {
    render(<DataRightsPanel />);
    expect(screen.getByText(/within one month/i)).toBeInTheDocument();
  });

  it('directs users to the privacy policy for organizer contact', () => {
    render(<DataRightsPanel />);
    expect(screen.getByText(/Privacy Policy/)).toBeInTheDocument();
  });

  it('mentions HGB retention for paid invoices under Art. 17', () => {
    render(<DataRightsPanel />);
    expect(screen.getByText(/HGB §257/)).toBeInTheDocument();
  });
});
