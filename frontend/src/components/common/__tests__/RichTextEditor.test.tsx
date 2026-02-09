import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Create stable mock objects outside of the mock
const mockRun = vi.fn();
const mockSetLink = vi.fn(() => ({ run: mockRun }));
const mockUnsetLink = vi.fn(() => ({ run: mockRun }));
const mockExtendMarkRange = vi.fn(() => ({
  setLink: mockSetLink,
  unsetLink: mockUnsetLink,
}));
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
  getHTML: vi.fn(() => "<p>Test content</p>"),
  getText: vi.fn(() => "Test content"),
  getAttributes: vi.fn(() => ({})),
  isFocused: false,
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

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => mockEditor),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content">{editor ? "Editor active" : "No editor"}</div>
  ),
  Extension: {
    create: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-underline", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-link", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-image", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-text-align", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-highlight", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-text-style", () => ({
  TextStyle: {},
}));

vi.mock("@tiptap/extension-color", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-font-family", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-subscript", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-superscript", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-table", () => ({
  Table: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-table-row", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-table-cell", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-table-header", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-task-list", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-task-item", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-youtube", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

// Import after mocks are set up
import RichTextEditor from "../RichTextEditor";

describe("RichTextEditor", () => {
  const defaultProps = {
    value: "",
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsActive = vi.fn(() => false);
    mockEditor.isActive = mockIsActive;
    mockEditor.getText.mockReturnValue("Test content");
  });

  it("renders the editor content area", () => {
    render(<RichTextEditor {...defaultProps} />);
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();
  });

  it("renders toolbar buttons", () => {
    render(<RichTextEditor {...defaultProps} />);

    expect(screen.getByTitle("Bold")).toBeInTheDocument();
    expect(screen.getByTitle("Italic")).toBeInTheDocument();
    expect(screen.getByTitle("Underline")).toBeInTheDocument();
    expect(screen.getByTitle("Bullet List")).toBeInTheDocument();
    expect(screen.getByTitle("Numbered List")).toBeInTheDocument();
    expect(screen.getByTitle("Link")).toBeInTheDocument();
  });

  it("calls chain().focus().toggleBold().run() when bold button is clicked", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle("Bold"));
    expect(mockChain).toHaveBeenCalled();
  });

  it("calls chain().focus().toggleItalic().run() when italic button is clicked", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle("Italic"));
    expect(mockChain).toHaveBeenCalled();
  });

  it("calls chain().focus().toggleUnderline().run() when underline button is clicked", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle("Underline"));
    expect(mockChain).toHaveBeenCalled();
  });

  it("disables toolbar buttons when disabled prop is true", () => {
    render(<RichTextEditor {...defaultProps} disabled={true} />);

    expect(screen.getByTitle("Bold")).toBeDisabled();
    expect(screen.getByTitle("Italic")).toBeDisabled();
    expect(screen.getByTitle("Underline")).toBeDisabled();
    expect(screen.getByTitle("Bullet List")).toBeDisabled();
    expect(screen.getByTitle("Numbered List")).toBeDisabled();
    expect(screen.getByTitle("Link")).toBeDisabled();
  });

  it("applies disabled styling when disabled", () => {
    const { container } = render(<RichTextEditor {...defaultProps} disabled={true} />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass("opacity-50");
    expect(wrapper).toHaveClass("bg-gray-100");
  });

  it("does not show character counter when maxLength is not provided", () => {
    render(<RichTextEditor {...defaultProps} />);

    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it("shows character counter when maxLength is provided", () => {
    mockEditor.getText.mockReturnValue("Test");
    render(<RichTextEditor {...defaultProps} maxLength={100} />);

    // The component should show the character count
    expect(screen.getByText(/\/ 100/)).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <RichTextEditor {...defaultProps} className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("highlights active bold button when editor has bold active", () => {
    mockEditor.isActive = vi.fn((type: string) => type === "bold");
    render(<RichTextEditor {...defaultProps} />);

    const boldButton = screen.getByTitle("Bold");
    expect(boldButton.className).toContain("bg-primary-100");
  });

  it("highlights active italic button when editor has italic active", () => {
    mockEditor.isActive = vi.fn((type: string) => type === "italic");
    render(<RichTextEditor {...defaultProps} />);

    const italicButton = screen.getByTitle("Italic");
    expect(italicButton.className).toContain("bg-primary-100");
  });

  it("prompts for URL when link button is clicked", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("https://example.com");

    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle("Link"));
    expect(promptSpy).toHaveBeenCalledWith("URL", "https://");

    promptSpy.mockRestore();
  });

  it("does not set link when prompt is cancelled", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);

    render(<RichTextEditor {...defaultProps} />);

    await user.click(screen.getByTitle("Link"));
    // Chain should not be called for link setting when cancelled

    promptSpy.mockRestore();
  });
});
