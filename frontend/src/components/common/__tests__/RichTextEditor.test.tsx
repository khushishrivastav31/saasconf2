import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Create stable mock objects outside of the mock
const mockRun = vi.fn();
const mockSetLink = vi.fn(() => ({ run: mockRun }));
const mockUnsetLink = vi.fn(() => ({ run: mockRun }));
const mockExtendMarkRange = vi.fn(() => ({
  setLink: mockSetLink,
  unsetLink: mockUnsetLink,
}));
const mockInsertContent = vi.fn(() => ({ run: mockRun }));
const mockToggleBold = vi.fn(() => ({ run: mockRun }));
const mockToggleItalic = vi.fn(() => ({ run: mockRun }));
const mockToggleUnderline = vi.fn(() => ({ run: mockRun }));
const mockToggleBulletList = vi.fn(() => ({ run: mockRun }));
const mockToggleOrderedList = vi.fn(() => ({ run: mockRun }));

const mockFocus = vi.fn(() => ({
  toggleBold: mockToggleBold,
  toggleItalic: mockToggleItalic,
  toggleUnderline: mockToggleUnderline,
  toggleBulletList: mockToggleBulletList,
  toggleOrderedList: mockToggleOrderedList,
  extendMarkRange: mockExtendMarkRange,
  insertContent: mockInsertContent,
}));

const mockChain = vi.fn(() => ({
  focus: mockFocus,
}));

let mockIsActive = vi.fn(() => false);

const mockCan = vi.fn(() => ({
  undo: () => true,
  redo: () => true,
  sinkListItem: () => true,
  liftListItem: () => true,
  mergeCells: () => true,
  splitCell: () => true,
}));

const mockEditor = {
  isActive: mockIsActive,
  chain: mockChain,
  can: mockCan,
  getHTML: vi.fn(() => '<p>Test content</p>'),
  getText: vi.fn(() => 'Test content'),
  getAttributes: vi.fn(() => ({})),
  isFocused: false,
  state: {
    selection: {
      empty: true,
    },
  },
  commands: {
    setContent: vi.fn(),
  },
  setEditable: vi.fn(),
  view: {
    dom: {
      querySelector: vi.fn(() => null),
    },
  },
};

vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => mockEditor),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{editor ? 'Editor active' : 'No editor'}</div>
  ),
  Extension: {
    create: vi.fn(() => ({})),
  },
}));

vi.mock('../richtext/extensions', () => ({
  getEditorExtensions: vi.fn(() => []),
}));

vi.mock('@tiptap/starter-kit', () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-underline', () => ({
  default: {},
}));

vi.mock('@tiptap/extension-link', () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-image', () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-text-align', () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-highlight', () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-text-style', () => ({
  TextStyle: {},
}));

vi.mock('@tiptap/extension-color', () => ({
  default: {},
}));

vi.mock('@tiptap/extension-font-family', () => ({
  default: {},
}));

vi.mock('@tiptap/extension-subscript', () => ({
  default: {},
}));

vi.mock('@tiptap/extension-superscript', () => ({
  default: {},
}));

vi.mock('@tiptap/extension-table', () => ({
  Table: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-table-row', () => ({
  default: {},
}));

vi.mock('@tiptap/extension-table-cell', () => ({
  default: {
    configure: vi.fn(() => ({})),
    extend: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-table-header', () => ({
  default: {
    configure: vi.fn(() => ({})),
    extend: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-task-list', () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-task-item', () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock('@tiptap/extension-youtube', () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

// Import after mocks are set up
import RichTextEditor, { isHtmlBlank } from '../RichTextEditor';

describe('RichTextEditor', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActive = vi.fn(() => false);
    mockEditor.isActive = mockIsActive;
    mockEditor.getText.mockReturnValue('Test content');
  });

  it('renders the editor content area', () => {
    render(<RichTextEditor {...defaultProps} />);
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('renders toolbar buttons', () => {
    render(<RichTextEditor {...defaultProps} />);

    expect(screen.getByTitle('Bold')).toBeInTheDocument();
    expect(screen.getByTitle('Italic')).toBeInTheDocument();
    expect(screen.getByTitle('Underline')).toBeInTheDocument();
    expect(screen.getByTitle('Bullet List')).toBeInTheDocument();
    expect(screen.getByTitle('Numbered List')).toBeInTheDocument();
    expect(screen.getByTitle('Link')).toBeInTheDocument();
  });

  it('calls chain().focus().toggleBold().run() when bold button is clicked', async () => {
    const user = userEvent.setup();
    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle('Bold'));
    expect(mockChain).toHaveBeenCalled();
  });

  it('calls chain().focus().toggleItalic().run() when italic button is clicked', async () => {
    const user = userEvent.setup();
    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle('Italic'));
    expect(mockChain).toHaveBeenCalled();
  });

  it('calls chain().focus().toggleUnderline().run() when underline button is clicked', async () => {
    const user = userEvent.setup();
    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle('Underline'));
    expect(mockChain).toHaveBeenCalled();
  });

  it('disables toolbar buttons when disabled prop is true', () => {
    render(<RichTextEditor {...defaultProps} disabled={true} />);

    expect(screen.getByTitle('Bold')).toBeDisabled();
    expect(screen.getByTitle('Italic')).toBeDisabled();
    expect(screen.getByTitle('Underline')).toBeDisabled();
    expect(screen.getByTitle('Bullet List')).toBeDisabled();
    expect(screen.getByTitle('Numbered List')).toBeDisabled();
    expect(screen.getByTitle('Link')).toBeDisabled();
  });

  it('applies disabled styling when disabled', () => {
    const { container } = render(<RichTextEditor {...defaultProps} disabled={true} />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('opacity-50');
    expect(wrapper).toHaveClass('bg-gray-100');
  });

  it('does not show character counter when maxLength is not provided', () => {
    render(<RichTextEditor {...defaultProps} />);

    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it('shows character counter when maxLength is provided', () => {
    mockEditor.getText.mockReturnValue('Test');
    render(<RichTextEditor {...defaultProps} maxLength={100} />);

    // The component should show the character count
    expect(screen.getByText(/\/ 100/)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<RichTextEditor {...defaultProps} className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('highlights active bold button when editor has bold active', () => {
    mockEditor.isActive = vi.fn((type: string) => type === 'bold');
    render(<RichTextEditor {...defaultProps} />);

    const boldButton = screen.getByTitle('Bold');
    expect(boldButton.className).toContain('bg-primary-100');
  });

  it('highlights active italic button when editor has italic active', () => {
    mockEditor.isActive = vi.fn((type: string) => type === 'italic');
    render(<RichTextEditor {...defaultProps} />);

    const italicButton = screen.getByTitle('Italic');
    expect(italicButton.className).toContain('bg-primary-100');
  });

  it('opens prompt dialog when link button is clicked', async () => {
    const user = userEvent.setup();

    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle('Link'));
    // The prompt dialog should appear with the URL input
    expect(screen.getByText('Enter URL')).toBeInTheDocument();
  });

  it('closes prompt dialog when cancel is clicked', async () => {
    const user = userEvent.setup();

    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle('Link'));
    expect(screen.getByText('Enter URL')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Enter URL')).not.toBeInTheDocument();
  });

  // Regression (MAIN-13413): the editor is frequently embedded inside a parent
  // <form> (e.g. the paper creation form). The link/image/YouTube prompt dialog
  // must NOT render nested inside that form — browsers flatten DOM-nested forms,
  // so the dialog's own submit handler is bypassed and clicking OK / pressing
  // Enter submits the OUTER form, navigating the admin away from the page.
  it('renders the prompt dialog outside any parent form', async () => {
    const user = userEvent.setup();
    const parentSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());

    render(
      <form data-testid="parent-form" onSubmit={parentSubmit}>
        <RichTextEditor {...defaultProps} />
      </form>
    );

    await user.click(screen.getByTitle('Link'));
    const dialogHeading = screen.getByText('Enter URL');
    const parentForm = screen.getByTestId('parent-form');
    expect(parentForm.contains(dialogHeading)).toBe(false);
  });

  it('does not submit a parent form when the link prompt is confirmed', async () => {
    const user = userEvent.setup();
    const parentSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());

    render(
      <form data-testid="parent-form" onSubmit={parentSubmit}>
        <RichTextEditor {...defaultProps} />
      </form>
    );

    await user.click(screen.getByTitle('Link'));
    const input = screen.getByPlaceholderText('https://');
    await user.clear(input);
    await user.type(input, 'https://example.com');
    await user.click(screen.getByText('OK'));

    expect(parentSubmit).not.toHaveBeenCalled();
  });

  describe('source-mode normalisation via handleSourceChange', () => {
    it('calls onChange with empty string when source textarea contains only <p></p>', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<RichTextEditor value="" onChange={onChange} showHtmlToggle />);

      await user.click(screen.getByText('<> HTML'));
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, '<p></p>');

      const calls = onChange.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toBe('');
    });

    it('calls onChange with empty string when source textarea contains only <p><br></p>', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<RichTextEditor value="" onChange={onChange} showHtmlToggle />);

      await user.click(screen.getByText('<> HTML'));
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, '<p><br></p>');

      const calls = onChange.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toBe('');
    });

    it('calls onChange with non-empty string when source textarea has real content', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<RichTextEditor value="" onChange={onChange} showHtmlToggle />);

      await user.click(screen.getByText('<> HTML'));
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.type(textarea, '<p>Hello</p>');

      const calls = onChange.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).not.toBe('');
    });
  });
});

describe('toolbarVariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActive = vi.fn(() => false);
    mockEditor.isActive = mockIsActive;
    mockEditor.getText.mockReturnValue('');
  });

  describe('speaker variant', () => {
    it('hides font family select', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Font Family')).not.toBeInTheDocument();
    });

    it('hides font size select', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Font Size')).not.toBeInTheDocument();
    });

    it('hides H1 button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Heading 1')).not.toBeInTheDocument();
    });

    it('hides H2 button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Heading 2')).not.toBeInTheDocument();
    });

    it('hides H3 button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Heading 3')).not.toBeInTheDocument();
    });

    it('hides text colour picker', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Text Color')).not.toBeInTheDocument();
    });

    it('hides highlight colour picker', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Highlight Color')).not.toBeInTheDocument();
    });

    it('hides strikethrough button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Strikethrough')).not.toBeInTheDocument();
    });

    it('hides subscript button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Subscript')).not.toBeInTheDocument();
    });

    it('hides superscript button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Superscript')).not.toBeInTheDocument();
    });

    it('hides centre alignment button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Align Center')).not.toBeInTheDocument();
    });

    it('hides right alignment button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Align Right')).not.toBeInTheDocument();
    });

    it('hides justify alignment button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Justify')).not.toBeInTheDocument();
    });

    it('keeps left alignment button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.getByTitle('Align Left')).toBeInTheDocument();
    });

    it('hides insert image button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Insert Image')).not.toBeInTheDocument();
    });

    it('hides insert YouTube button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.queryByTitle('Insert YouTube')).not.toBeInTheDocument();
    });

    it('still shows basic formatting buttons', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
      expect(screen.getByTitle('Bold')).toBeInTheDocument();
      expect(screen.getByTitle('Italic')).toBeInTheDocument();
      expect(screen.getByTitle('Link')).toBeInTheDocument();
    });
  });

  describe('full variant (default)', () => {
    it('shows insert image button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="full" />);
      expect(screen.getByTitle('Insert Image')).toBeInTheDocument();
    });

    it('shows insert YouTube button', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="full" />);
      expect(screen.getByTitle('Insert YouTube')).toBeInTheDocument();
    });

    it('shows all alignment buttons', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="full" />);
      expect(screen.getByTitle('Align Left')).toBeInTheDocument();
      expect(screen.getByTitle('Align Center')).toBeInTheDocument();
      expect(screen.getByTitle('Align Right')).toBeInTheDocument();
      expect(screen.getByTitle('Justify')).toBeInTheDocument();
    });

    it('shows font family and font size selects', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="full" />);
      expect(screen.getByTitle('Font Family')).toBeInTheDocument();
      expect(screen.getByTitle('Font Size')).toBeInTheDocument();
    });

    it('shows heading buttons', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="full" />);
      expect(screen.getByTitle('Heading 1')).toBeInTheDocument();
      expect(screen.getByTitle('Heading 2')).toBeInTheDocument();
      expect(screen.getByTitle('Heading 3')).toBeInTheDocument();
    });

    it('shows colour pickers', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="full" />);
      expect(screen.getByTitle('Text Color')).toBeInTheDocument();
      expect(screen.getByTitle('Highlight Color')).toBeInTheDocument();
    });

    it('default (no toolbarVariant prop) behaves as full', () => {
      render(<RichTextEditor value="" onChange={vi.fn()} />);
      expect(screen.getByTitle('Insert Image')).toBeInTheDocument();
      expect(screen.getByTitle('Insert YouTube')).toBeInTheDocument();
      expect(screen.getByTitle('Align Center')).toBeInTheDocument();
    });
  });
});

describe('isHtmlBlank', () => {
  it.each([['<p></p>'], ['<p><br></p>'], ['<p>&nbsp;</p>'], ['   '], ['']])(
    'treats %s as blank',
    (html) => {
      expect(isHtmlBlank(html)).toBe(true);
    }
  );

  it.each([['<p>Hello</p>'], ['<p>Real content</p>'], ['<strong>Bold</strong>']])(
    'treats %s as non-blank',
    (html) => {
      expect(isHtmlBlank(html)).toBe(false);
    }
  );
});

describe('Remove Link toolbar button (MAIN-13412)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActive = vi.fn(() => false);
    mockEditor.isActive = mockIsActive;
    mockEditor.getAttributes = vi.fn(() => ({}));
    mockEditor.getText.mockReturnValue('');
    mockEditor.state.selection.empty = true;
  });

  it('renders a Remove Link button', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTitle('Remove Link')).toBeInTheDocument();
  });

  it('is disabled when cursor is not on a link', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTitle('Remove Link')).toBeDisabled();
  });

  it('is enabled when cursor is on a link', () => {
    mockEditor.isActive = vi.fn((type: string) => type === 'link');
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTitle('Remove Link')).not.toBeDisabled();
  });

  it('calls unsetLink chain when clicked', async () => {
    const user = userEvent.setup();
    mockEditor.isActive = vi.fn((type: string) => type === 'link');
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByTitle('Remove Link'));
    expect(mockExtendMarkRange).toHaveBeenCalledWith('link');
    expect(mockUnsetLink).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });

  it('appears in speaker variant (no gating)', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} toolbarVariant="speaker" />);
    expect(screen.getByTitle('Remove Link')).toBeInTheDocument();
  });
});

describe('link dialog Remove action (MAIN-13412)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActive = vi.fn(() => false);
    mockEditor.isActive = mockIsActive;
    mockEditor.getAttributes = vi.fn(() => ({}));
    mockEditor.getText.mockReturnValue('');
    mockEditor.state.selection.empty = true;
  });

  it('does not show Remove link button when cursor is not on a link', async () => {
    const user = userEvent.setup();
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByTitle('Link'));
    expect(screen.queryByText('Remove link')).not.toBeInTheDocument();
  });

  it('shows Remove link button in dialog when cursor is on a link', async () => {
    const user = userEvent.setup();
    mockEditor.isActive = vi.fn((type: string) => type === 'link');
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByTitle('Link'));
    expect(screen.getByText('Remove link')).toBeInTheDocument();
  });

  it('clicking Remove link triggers unsetLink and closes dialog', async () => {
    const user = userEvent.setup();
    mockEditor.isActive = vi.fn((type: string) => type === 'link');
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByTitle('Link'));
    await user.click(screen.getByText('Remove link'));
    expect(mockExtendMarkRange).toHaveBeenCalledWith('link');
    expect(mockUnsetLink).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
    expect(screen.queryByText('Enter URL')).not.toBeInTheDocument();
  });
});

describe('empty-selection link insert (MAIN-13412)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActive = vi.fn(() => false);
    mockEditor.isActive = mockIsActive;
    mockEditor.getAttributes = vi.fn(() => ({}));
    mockEditor.getText.mockReturnValue('');
    mockEditor.state.selection.empty = true;
  });

  it('calls insertContent (linked text node) when URL submitted with empty selection and not on a link', async () => {
    const user = userEvent.setup();
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByTitle('Link'));
    const input = screen.getByPlaceholderText('https://');
    await user.clear(input);
    await user.type(input, 'https://example.com');
    await user.click(screen.getByText('OK'));
    expect(mockInsertContent).toHaveBeenCalledWith({
      type: 'text',
      text: 'https://example.com',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    });
    expect(mockSetLink).not.toHaveBeenCalled();
  });

  it('calls setLink (not insertContent) when URL submitted with a text selection', async () => {
    const user = userEvent.setup();
    mockEditor.state.selection.empty = false;
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByTitle('Link'));
    const input = screen.getByPlaceholderText('https://');
    await user.clear(input);
    await user.type(input, 'https://example.com');
    await user.click(screen.getByText('OK'));
    expect(mockSetLink).toHaveBeenCalledWith({ href: 'https://example.com' });
    expect(mockInsertContent).not.toHaveBeenCalled();
  });
});
