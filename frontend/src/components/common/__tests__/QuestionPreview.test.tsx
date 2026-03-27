import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuestionPreview from '../QuestionPreview';
import type { RegistrationQuestion } from '../registrationQuestionTypes';

vi.mock('../RichTextDisplay', () => ({
  default: ({ content, fallback }: { content: string; fallback: string }) => (
    <span data-testid="rich-text-display">{content || fallback}</span>
  ),
}));

vi.mock('../../utils/richText', () => ({
  stripHtml: (html: string) => html.replace(/<[^>]*>/g, ''),
}));

const makeQuestion = (overrides: Partial<RegistrationQuestion> = {}): RegistrationQuestion => ({
  id: `q-${Math.random()}`,
  text: 'Sample question',
  type: 'text',
  required: false,
  help_text: '',
  options: [],
  sort_order: 0,
  is_active: true,
  ...overrides,
});

describe('QuestionPreview', () => {
  it('shows empty state when no active questions', () => {
    render(<QuestionPreview questions={[]} policies={null} entityName="Test Training" />);
    expect(screen.getByText('No active questions to preview.')).toBeInTheDocument();
    expect(screen.getByText('Add questions above and mark them as active.')).toBeInTheDocument();
  });

  it('shows empty state when all questions are inactive', () => {
    const questions = [makeQuestion({ is_active: false, text: 'Hidden question' })];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test Training" />);
    expect(screen.getByText('No active questions to preview.')).toBeInTheDocument();
  });

  it('renders preview for text question', () => {
    const questions = [makeQuestion({ type: 'text', text: 'Your name?' })];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test Training" />);
    expect(screen.getByText('Your name?')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders preview for checkbox question', () => {
    const questions = [makeQuestion({ type: 'checkbox', text: 'I agree to terms' })];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test Training" />);
    expect(screen.getByText('I agree to terms')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders preview for radio question with options', () => {
    const questions = [
      makeQuestion({
        type: 'radio',
        text: 'Choose one',
        options: ['Option A', 'Option B'],
      }),
    ];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test Training" />);
    expect(screen.getByText('Choose one')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
  });

  it('renders preview for dropdown question with options', () => {
    const questions = [
      makeQuestion({
        type: 'dropdown',
        text: 'Select an item',
        options: ['Item A', 'Item B', 'Item C'],
      }),
    ];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test Training" />);
    expect(screen.getByText('Select an item')).toBeInTheDocument();
    // Dropdown has a select element
    const selectEl = screen.getByRole('combobox');
    expect(selectEl).toBeInTheDocument();
  });

  it('shows entity name', () => {
    const questions = [makeQuestion({ type: 'text', text: 'Q1' })];
    render(<QuestionPreview questions={questions} policies={null} entityName="My Training" />);
    expect(screen.getByText('My Training')).toBeInTheDocument();
  });

  it('shows mandatory asterisk for required questions', () => {
    const questions = [makeQuestion({ type: 'text', text: 'Required Q', required: true })];
    const { container } = render(
      <QuestionPreview questions={questions} policies={null} entityName="Test" />
    );
    // There should be a * marker
    expect(container.textContent).toContain('*');
  });

  it('shows "Submit Answers" button', () => {
    const questions = [makeQuestion({ type: 'text', text: 'Q1' })];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test" />);
    expect(screen.getByText('Submit Answers')).toBeInTheDocument();
  });

  it('shows "Skip for now" when no mandatory questions', () => {
    const questions = [makeQuestion({ type: 'text', text: 'Q1', required: false })];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test" />);
    expect(screen.getByText('Skip for now')).toBeInTheDocument();
  });

  it('does not show "Skip for now" when there are mandatory questions', () => {
    const questions = [makeQuestion({ type: 'text', text: 'Q1', required: true })];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test" />);
    expect(screen.queryByText('Skip for now')).not.toBeInTheDocument();
  });

  it('renders Registration Questions heading', () => {
    const questions = [makeQuestion({ type: 'text', text: 'Q1' })];
    render(<QuestionPreview questions={questions} policies={null} entityName="Test" />);
    expect(screen.getByText('Registration Questions')).toBeInTheDocument();
  });
});
