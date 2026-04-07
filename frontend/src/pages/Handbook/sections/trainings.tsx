import type { HandbookCategory } from '../handbookSections';
import { trainingIntroCategory } from './trainingIntro';
import { trainingProgramCategory } from './trainingProgram';
import { trainingCustomersCategory } from './trainingCustomers';
import { trainingOperationsCategory } from './trainingOperations';
import { trainingCommunicationsCategory } from './trainingCommunications';
import { trainingAnalyticsCategory } from './trainingAnalytics';
import { trainingSettingsCategory } from './trainingSettings';
import { trainingAppendixCategory } from './trainingAppendix';

/** All training handbook categories in display order */
export const trainingCategories: HandbookCategory[] = [
  trainingIntroCategory,
  trainingProgramCategory,
  trainingCustomersCategory,
  trainingOperationsCategory,
  trainingCommunicationsCategory,
  trainingAnalyticsCategory,
  trainingSettingsCategory,
  trainingAppendixCategory,
];
