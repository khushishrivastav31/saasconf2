import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionCard from '../QuestionCard';
import type { RegistrationQuestion } from '../registrationQuestionTypes';

vi.mock('../MiniRichTextEditor', () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="mini-rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

const makeQuestion = (overrides: Partial<RegistrationQuestion> = {}): RegistrationQuestion => ({
  id: 'q-1',
  text: 'What is your role?',
  type: 'text',
  required: false,
  help_text: '',
  options: [],
  sort_order: 0,
  is_active: true,
  ...overrides,
});

describe('QuestionCard', () => {
  const mockOnChange = vi.fn();
  const mockOnRemove = vi.fn();
  const mockOnMoveUp = vi.fn();
  const mockOnMoveDown = vi.fn();

  const defaultProps = {
    onChange: mockOnChange,
    onRemove: mockOnRemove,
    onMoveUp: mockOnMoveUp,
    onMoveDown: mockOnMoveDown,
    isFirst: false,
    isLast: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders question text in editor', () => {
    render(<QuestionCard question={makeQuestion()} {...defaultProps} />);
    const editors = screen.getAllByTestId('mini-rich-text-editor');
    expect(editors[0]).toHaveValue('What is your role?');
  });

  it('shows type selector with current type', () => {
    render(<QuestionCard question={makeQuestion()} {...defaultProps} />);
    const typeSelect = screen.getByRole('combobox');
    expect(typeSelect).toHaveValue('text');
  });

  it('shows Mandatory checkbox', () => {
    render(<QuestionCard question={makeQuestion({ required: true })} {...defaultProps} />);
    const mandatoryCheckbox = screen.getByLabelText('Mandatory');
    expect(mandatoryCheckbox).toBeChecked();
  });

  it('shows Active checkbox', () => {
    render(<QuestionCard question={makeQuestion({ is_active: true })} {...defaultProps} />);
    const activeCheckbox = screen.getByLabelText('Active');
    expect(activeCheckbox).toBeChecked();
  });

  it('toggling Mandatory calls onChange', async () => {
    const user = userEvent.setup();
    render(<QuestionCard question={makeQuestion({ required: false })} {...defaultProps} />);
    const mandatoryCheckbox = screen.getByLabelText('Mandatory');
    await user.click(mandatoryCheckbox);
    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ required: true }));
  });

  it('toggling Active calls onChange', async () => {
    const user = userEvent.setup();
    render(<QuestionCard question={makeQuestion({ is_active: true })} {...defaultProps} />);
    const activeCheckbox = screen.getByLabelText('Active');
    await user.click(activeCheckbox);
    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
  });

  it('delete button calls onRemove', async () => {
    const user = userEvent.setup();
    render(<QuestionCard question={makeQuestion()} {...defaultProps} />);
    const removeBtn = screen.getByRole('button', { name: 'Remove question' });
    await user.click(removeBtn);
    expect(mockOnRemove).toHaveBeenCalled();
  });

  it('move up button calls onMoveUp', async () => {
    const user = userEvent.setup();
    render(<QuestionCard question={makeQuestion()} {...defaultProps} />);
    const moveUpBtn = screen.getByRole('button', { name: 'Move up' });
    await user.click(moveUpBtn);
    expect(mockOnMoveUp).toHaveBeenCalled();
  });

  it('move down button calls onMoveDown', async () => {
    const user = userEvent.setup();
    render(<QuestionCard question={makeQuestion()} {...defaultProps} />);
    const moveDownBtn = screen.getByRole('button', { name: 'Move down' });
    await user.click(moveDownBtn);
    expect(mockOnMoveDown).toHaveBeenCalled();
  });

  it('move up disabled when isFirst', () => {
    render(<QuestionCard question={makeQuestion()} {...defaultProps} isFirst={true} />);
    const moveUpBtn = screen.getByRole('button', { name: 'Move up' });
    expect(moveUpBtn).toBeDisabled();
  });

  it('move down disabled when isLast', () => {
    render(<QuestionCard question={makeQuestion()} {...defaultProps} isLast={true} />);
    const moveDownBtn = screen.getByRole('button', { name: 'Move down' });
    expect(moveDownBtn).toBeDisabled();
  });

  it('shows options for radio type', () => {
    render(
      <QuestionCard
        question={makeQuestion({ type: 'radio', options: ['Option A', 'Option B'] })}
        {...defaultProps}
      />
    );
    expect(screen.getByText('Options')).toBeInTheDocument();
    expect(screen.getByText('+ Add Option')).toBeInTheDocument();
  });

  it('shows options for dropdown type', () => {
    render(
      <QuestionCard
        question={makeQuestion({ type: 'dropdown', options: ['Opt 1', 'Opt 2'] })}
        {...defaultProps}
      />
    );
    expect(screen.getByText('Options')).toBeInTheDocument();
  });

  it('does not show options for text type', () => {
    render(<QuestionCard question={makeQuestion({ type: 'text' })} {...defaultProps} />);
    expect(screen.queryByText('Options')).not.toBeInTheDocument();
  });

  it('changing type calls onChange with new type', async () => {
    const user = userEvent.setup();
    render(<QuestionCard question={makeQuestion()} {...defaultProps} />);
    const typeSelect = screen.getByRole('combobox');
    await user.selectOptions(typeSelect, 'checkbox');
    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'checkbox' }));
  });
});
