import type { ReactNode } from 'react';

import { introductionCategory } from './sections/introduction';
import { eventSetupCategory } from './sections/eventSetup';
import { contentCategory } from './sections/content';
import { peopleCategory } from './sections/people';
import { partnershipsCategory } from './sections/partnerships';
import { registrationFinanceCategory } from './sections/registrationFinance';
import { communicationsCategory } from './sections/communications';
import { insightsCategory } from './sections/insights';
import { appendixCategory } from './sections/appendix';

export interface HandbookSection {
  id: string;
  title: string;
  content: () => ReactNode;
  categoryId: string;
}

export interface HandbookCategory {
  id: string;
  name: string;
  description: string;
  moduleCode?: string;
  sections: HandbookSection[];
}

export const handbookCategories: HandbookCategory[] = [
  introductionCategory,
  eventSetupCategory,
  contentCategory,
  peopleCategory,
  partnershipsCategory,
  registrationFinanceCategory,
  communicationsCategory,
  insightsCategory,
  appendixCategory,
];

// Flatten for backward compatibility
export const handbookSections: HandbookSection[] = handbookCategories.flatMap(
  (cat) => cat.sections
);
