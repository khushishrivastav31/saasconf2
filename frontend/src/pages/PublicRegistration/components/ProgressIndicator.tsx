/**
 * Progress Indicator Component
 *
 * Shows current progress through the registration wizard.
 */
import { WIZARD_STEPS } from '../../../types/publicRegistration';

interface ProgressIndicatorProps {
  currentStep: string;
}

const STEP_NUMBER_MAP: Record<string, number> = {
  welcome: 1,
  attendees: 2,
  billing: 3,
  review: 4,
  payment: 5,
  confirmation: 6,
};

export default function ProgressIndicator({ currentStep }: ProgressIndicatorProps) {
  const currentNumber = STEP_NUMBER_MAP[currentStep] || 1;

  return (
    <div className="portal-card mb-6">
      <div className="portal-progress">
        {WIZARD_STEPS.filter((step) => step.number !== 1 && step.number !== 6).map((step) => {
          const isActive = step.number === currentNumber;
          const isCompleted = step.number < currentNumber;

          return (
            <div
              key={step.number}
              className={`portal-progress-step ${
                isActive ? 'portal-progress-step-active' : ''
              } ${isCompleted ? 'portal-progress-step-completed' : ''}`}
            >
              <div className="portal-progress-step-number">{step.number - 1}</div>
              <div className="portal-progress-step-label">{step.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
