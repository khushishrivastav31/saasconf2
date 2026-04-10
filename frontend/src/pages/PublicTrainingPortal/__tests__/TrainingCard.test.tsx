import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import TrainingCard from '../components/TrainingCard';
import type { PublicTraining } from '../TrainingSearch';

function createTraining(overrides: Partial<PublicTraining> = {}): PublicTraining {
  return {
    placement_id: 'p-1',
    training_id: 't-1',
    training_name: 'ISTQB FL Deutsch',
    training_slug: 'istqb-fl-de',
    training_description: 'Test training description',
    start_date: '2027-03-01',
    duration: 4,
    placement_type: 'open',
    location_name: 'Schulungsraum',
    location_city: 'Berlin',
    language_name: 'Deutsch',
    language_id: 'lang-1',
    syllabus_name: 'ISTQB Foundation Level',
    syllabus_id: 'syl-1',
    theme_name: null,
    theme_id: null,
    regular_price: '1250.00',
    early_bird_price: null,
    currency: 'EUR',
    trainers: ['Max Trainer'],
    logo_url: null,
    is_guaranteed: false,
    exam_price: '200.00',
    location_country: 'DE',
    ...overrides,
  };
}

const t = (key: string) => {
  const map: Record<string, string> = {
    guaranteed: 'Guaranteed',
    per_person: 'per person',
    btn_register: 'Register',
  };
  return map[key] || key;
};

describe('TrainingCard', () => {
  it('renders training name and details', () => {
    render(
      <MemoryRouter>
        <TrainingCard training={createTraining()} tenantSlug="test" t={t} />
      </MemoryRouter>
    );

    expect(screen.getByText('ISTQB FL Deutsch')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
    expect(screen.getByText('ISTQB Foundation Level')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
  });

  it('shows guaranteed badge when is_guaranteed is true', () => {
    render(
      <MemoryRouter>
        <TrainingCard training={createTraining({ is_guaranteed: true })} tenantSlug="test" t={t} />
      </MemoryRouter>
    );

    expect(screen.getByText('Guaranteed')).toBeInTheDocument();
  });

  it('does not show guaranteed badge when is_guaranteed is false', () => {
    render(
      <MemoryRouter>
        <TrainingCard training={createTraining({ is_guaranteed: false })} tenantSlug="test" t={t} />
      </MemoryRouter>
    );

    expect(screen.queryByText('Guaranteed')).not.toBeInTheDocument();
  });

  it('shows price with currency symbol', () => {
    render(
      <MemoryRouter>
        <TrainingCard training={createTraining()} tenantSlug="test" t={t} />
      </MemoryRouter>
    );

    expect(screen.getByText(/1\.250/)).toBeInTheDocument();
    expect(screen.getByText('per person')).toBeInTheDocument();
  });

  it('shows early bird price when available', () => {
    render(
      <MemoryRouter>
        <TrainingCard
          training={createTraining({
            early_bird_price: '1100.00',
            regular_price: '1250.00',
          })}
          tenantSlug="test"
          t={t}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/1\.100/)).toBeInTheDocument();
    // Regular price shown as strikethrough
    expect(screen.getByText(/1\.250/)).toBeInTheDocument();
  });

  it('does not show location when location_city is null', () => {
    render(
      <MemoryRouter>
        <TrainingCard
          training={createTraining({ location_city: null, location_name: null })}
          tenantSlug="test"
          t={t}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
  });

  it('shows trainers when available', () => {
    render(
      <MemoryRouter>
        <TrainingCard
          training={createTraining({ trainers: ['Alice Smith', 'Bob Jones'] })}
          tenantSlug="test"
          t={t}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Alice Smith, Bob Jones/)).toBeInTheDocument();
  });
});
