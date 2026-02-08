import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReviewForm from "../ReviewForm";
import type {
  PortalReviewConfig,
  PortalReviewCriterion,
  PortalReviewQuestion,
  PortalReviewScaleOption,
} from "../../../types/portal";

// Mock the portalApi module
vi.mock("../../../config/portalApi", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Import the mocked api
import portalApi from "../../../config/portalApi";

const mockPortalApi = vi.mocked(portalApi);

// Mock RichTextDisplay and RichTextEditor components
vi.mock("../../common/RichTextDisplay", () => ({
  default: ({ content, className }: { content: string; className?: string }) => (
    <div data-testid="rich-text-display" className={className}>
      {content}
    </div>
  ),
}));

vi.mock("../../common/RichTextEditor", () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

// Helper to create test options
function createScaleOption(
  id: string,
  label: string,
  numericValue: number | null,
  displayOrder: number,
  isUnsure = false
): PortalReviewScaleOption {
  return {
    id,
    label,
    numeric_value: numericValue,
    is_unsure: isUnsure,
    display_order: displayOrder,
  };
}

// Helper to create test question
function createQuestion(
  id: string,
  text: string,
  displayOrder: number,
  commentRequirement: "optional" | "required" | "required_if_low_score" = "optional"
): PortalReviewQuestion {
  return {
    id,
    text,
    help_text: `Help text for ${text}`,
    question_type: "scored",
    weight: 1,
    comment_requirement: commentRequirement,
    low_score_threshold: null,
    count_in_score: true,
    display_order: displayOrder,
    scale: {
      id: `scale-${id}`,
      name: "Standard Scale",
      scale_type: "numeric_range",
      options: [
        createScaleOption(`opt-${id}-1`, "Poor", 1, 1),
        createScaleOption(`opt-${id}-2`, "Fair", 2, 2),
        createScaleOption(`opt-${id}-3`, "Good", 3, 3),
        createScaleOption(`opt-${id}-4`, "Excellent", 4, 4),
        createScaleOption(`opt-${id}-5`, "N/A", null, 5, true),
      ],
    },
  };
}

// Helper to create test criterion
function createCriterion(
  id: string,
  title: string,
  displayOrder: number,
  questions: PortalReviewQuestion[]
): PortalReviewCriterion {
  return {
    id,
    title,
    description: `Description for ${title}`,
    display_order: displayOrder,
    questions,
  };
}

// Standard test config
const mockReviewConfig: PortalReviewConfig = {
  criteria: [
    createCriterion("crit-1", "Technical Quality", 1, [
      createQuestion("q-1", "How is the technical depth?", 1, "optional"),
      createQuestion("q-2", "Is the approach innovative?", 2, "required"),
    ]),
    createCriterion("crit-2", "Presentation", 2, [
      createQuestion("q-3", "How clear is the abstract?", 1, "optional"),
    ]),
  ],
  existing_review: null,
  form_settings: {
    enable_speaker_feedback: true,
    enable_internal_comment: true,
  },
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("ReviewForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    it("shows loading spinner while fetching config", () => {
      mockPortalApi.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { container } = renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      // The loading spinner has the animate-spin class
      expect(container.querySelector(".animate-spin")).toBeTruthy();
    });
  });

  describe("error state", () => {
    it("shows error message when config fetch fails", async () => {
      mockPortalApi.get.mockRejectedValueOnce(new Error("Network error"));

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      // The parseApiError function returns the error message, so we look for that
      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe("empty criteria state", () => {
    it("shows message when no criteria are configured", async () => {
      mockPortalApi.get.mockResolvedValueOnce({
        data: { ...mockReviewConfig, criteria: [] },
      });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText(/no review criteria configured/i)).toBeInTheDocument();
      });
    });
  });

  describe("form rendering", () => {
    it("renders review form with criteria and questions", async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Review")).toBeInTheDocument();
      });

      expect(screen.getByText("Technical Quality")).toBeInTheDocument();
      expect(screen.getByText("Presentation")).toBeInTheDocument();
      expect(screen.getByText("How is the technical depth?")).toBeInTheDocument();
      expect(screen.getByText("Is the approach innovative?")).toBeInTheDocument();
      expect(screen.getByText("How clear is the abstract?")).toBeInTheDocument();
    });

    it("renders scale options for each question", async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Technical Quality")).toBeInTheDocument();
      });

      // Check that scale options are rendered (multiple times for multiple questions)
      const poorLabels = screen.getAllByText("Poor");
      expect(poorLabels.length).toBeGreaterThan(0);

      const excellentLabels = screen.getAllByText("Excellent");
      expect(excellentLabels.length).toBeGreaterThan(0);
    });

    it("renders help text for questions", async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Help text for How is the technical depth?")).toBeInTheDocument();
      });
    });

    it("renders speaker feedback field when enabled", async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Feedback for the speaker(s)")).toBeInTheDocument();
      });
    });

    it("renders internal comment field when enabled", async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Internal Comment")).toBeInTheDocument();
      });
    });

    it("hides speaker feedback field when disabled", async () => {
      const config = {
        ...mockReviewConfig,
        form_settings: {
          enable_speaker_feedback: false,
          enable_internal_comment: true,
        },
      };
      mockPortalApi.get.mockResolvedValueOnce({ data: config });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Internal Comment")).toBeInTheDocument();
      });

      expect(screen.queryByText("Feedback for the speaker(s)")).not.toBeInTheDocument();
    });

    it("hides internal comment field when disabled", async () => {
      const config = {
        ...mockReviewConfig,
        form_settings: {
          enable_speaker_feedback: true,
          enable_internal_comment: false,
        },
      };
      mockPortalApi.get.mockResolvedValueOnce({ data: config });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Feedback for the speaker(s)")).toBeInTheDocument();
      });

      expect(screen.queryByText("Internal Comment")).not.toBeInTheDocument();
    });

    it("renders Save Draft and Submit Review buttons", async () => {
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Draft" })).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: "Submit Review" })).toBeInTheDocument();
    });
  });

  describe("form interactions", () => {
    it("allows selecting a scale option", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Technical Quality")).toBeInTheDocument();
      });

      // Find and click a radio button
      const radioButtons = screen.getAllByRole("radio");
      await user.click(radioButtons[0]);

      expect(radioButtons[0]).toBeChecked();
    });

    it("allows typing in comment fields", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Technical Quality")).toBeInTheDocument();
      });

      // Find comment textareas (not the rich text editor ones)
      const commentTextareas = screen.getAllByPlaceholderText("Add your comment...");
      expect(commentTextareas.length).toBeGreaterThan(0);

      await user.type(commentTextareas[0], "This is a great paper!");

      expect(commentTextareas[0]).toHaveValue("This is a great paper!");
    });

    it("allows typing in speaker feedback field", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Feedback for the speaker(s)")).toBeInTheDocument();
      });

      const richTextEditors = screen.getAllByTestId("rich-text-editor");
      const speakerFeedbackEditor = richTextEditors[0];

      await user.type(speakerFeedbackEditor, "Great presentation ideas!");

      expect(speakerFeedbackEditor).toHaveValue("Great presentation ideas!");
    });
  });

  describe("form submission", () => {
    it("calls save draft API when Save Draft is clicked", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });
      mockPortalApi.post.mockResolvedValueOnce({});

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Draft" })).toBeInTheDocument();
      });

      const saveDraftButton = screen.getByRole("button", { name: "Save Draft" });
      await user.click(saveDraftButton);

      await waitFor(() => {
        expect(mockPortalApi.post).toHaveBeenCalledWith(
          "/portal/assignments/assign-123/review?submit=false",
          expect.objectContaining({
            answers: expect.any(Array),
            speaker_feedback: null,
            internal_comment: null,
          })
        );
      });
    });

    it("calls submit API when Submit Review is clicked", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });
      mockPortalApi.post.mockResolvedValueOnce({});

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Submit Review" })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", { name: "Submit Review" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockPortalApi.post).toHaveBeenCalledWith(
          "/portal/assignments/assign-123/review?submit=true",
          expect.objectContaining({
            answers: expect.any(Array),
          })
        );
      });
    });

    it("shows loading state during save draft", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      let resolveSave: (value: unknown) => void;
      mockPortalApi.post.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSave = resolve;
          })
      );

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Draft" })).toBeInTheDocument();
      });

      const saveDraftButton = screen.getByRole("button", { name: "Save Draft" });
      await user.click(saveDraftButton);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
      });

      resolveSave!({});
    });

    it("shows loading state during submit", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      let resolveSubmit: (value: unknown) => void;
      mockPortalApi.post.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubmit = resolve;
          })
      );

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Submit Review" })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", { name: "Submit Review" });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Submitting..." })).toBeInTheDocument();
      });

      resolveSubmit!({});
    });

    it("disables buttons during submission", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });

      mockPortalApi.post.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Draft" })).toBeInTheDocument();
      });

      const saveDraftButton = screen.getByRole("button", { name: "Save Draft" });
      await user.click(saveDraftButton);

      await waitFor(() => {
        const submitButton = screen.getByRole("button", { name: "Submit Review" });
        expect(submitButton).toBeDisabled();
      });
    });

    it("calls onReviewSubmitted callback after successful save", async () => {
      const user = userEvent.setup();
      const onReviewSubmitted = vi.fn();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });
      mockPortalApi.post.mockResolvedValueOnce({});

      renderWithProviders(
        <ReviewForm assignmentId="assign-123" onReviewSubmitted={onReviewSubmitted} />
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Draft" })).toBeInTheDocument();
      });

      const saveDraftButton = screen.getByRole("button", { name: "Save Draft" });
      await user.click(saveDraftButton);

      await waitFor(() => {
        expect(onReviewSubmitted).toHaveBeenCalledTimes(1);
      });
    });

    it("shows error message when save fails", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });
      mockPortalApi.post.mockRejectedValueOnce(new Error("Save operation error"));

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Draft" })).toBeInTheDocument();
      });

      const saveDraftButton = screen.getByRole("button", { name: "Save Draft" });
      await user.click(saveDraftButton);

      // The parseApiError function returns the error message
      await waitFor(() => {
        expect(screen.getByText("Save operation error")).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("shows error message when submit fails", async () => {
      const user = userEvent.setup();
      mockPortalApi.get.mockResolvedValueOnce({ data: mockReviewConfig });
      mockPortalApi.post.mockRejectedValueOnce(new Error("Submit operation error"));

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Submit Review" })).toBeInTheDocument();
      });

      const submitButton = screen.getByRole("button", { name: "Submit Review" });
      await user.click(submitButton);

      // The parseApiError function returns the error message
      await waitFor(() => {
        expect(screen.getByText("Submit operation error")).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe("existing review (read-only mode)", () => {
    it("shows submitted badge for submitted reviews", async () => {
      const configWithSubmittedReview: PortalReviewConfig = {
        ...mockReviewConfig,
        existing_review: {
          id: "review-123",
          status: "submitted",
          total_score: 3.5,
          speaker_feedback: "Great work!",
          internal_comment: "Accept this paper",
          answers: [
            { question_id: "q-1", selected_option_id: "opt-q-1-3", comment: "Good depth" },
            { question_id: "q-2", selected_option_id: "opt-q-2-4", comment: null },
            { question_id: "q-3", selected_option_id: "opt-q-3-3", comment: null },
          ],
          submitted_at: "2024-01-15T10:30:00Z",
        },
      };

      mockPortalApi.get.mockResolvedValueOnce({ data: configWithSubmittedReview });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Submitted")).toBeInTheDocument();
      });
    });

    it("hides action buttons for submitted reviews", async () => {
      const configWithSubmittedReview: PortalReviewConfig = {
        ...mockReviewConfig,
        existing_review: {
          id: "review-123",
          status: "submitted",
          total_score: 3.5,
          speaker_feedback: null,
          internal_comment: null,
          answers: [],
          submitted_at: "2024-01-15T10:30:00Z",
        },
      };

      mockPortalApi.get.mockResolvedValueOnce({ data: configWithSubmittedReview });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Submitted")).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Submit Review" })).not.toBeInTheDocument();
    });

    it("displays existing answers in read-only mode", async () => {
      const configWithSubmittedReview: PortalReviewConfig = {
        ...mockReviewConfig,
        existing_review: {
          id: "review-123",
          status: "submitted",
          total_score: 3.5,
          speaker_feedback: "Great speaker feedback",
          internal_comment: "Internal notes here",
          answers: [
            { question_id: "q-1", selected_option_id: "opt-q-1-3", comment: "Good technical depth" },
          ],
          submitted_at: "2024-01-15T10:30:00Z",
        },
      };

      mockPortalApi.get.mockResolvedValueOnce({ data: configWithSubmittedReview });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("Submitted")).toBeInTheDocument();
      });

      // Should display the speaker feedback
      expect(screen.getByText("Great speaker feedback")).toBeInTheDocument();

      // Should display the internal comment
      expect(screen.getByText("Internal notes here")).toBeInTheDocument();
    });

    it("pre-fills form with existing draft review data", async () => {
      const configWithDraftReview: PortalReviewConfig = {
        ...mockReviewConfig,
        existing_review: {
          id: "review-123",
          status: "draft",
          total_score: null,
          speaker_feedback: "Draft feedback",
          internal_comment: "Draft internal comment",
          answers: [
            { question_id: "q-1", selected_option_id: "opt-q-1-2", comment: "Draft comment" },
          ],
          submitted_at: null,
        },
      };

      mockPortalApi.get.mockResolvedValueOnce({ data: configWithDraftReview });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Draft" })).toBeInTheDocument();
      });

      // Check that the rich text editor for speaker feedback has the value
      const richTextEditors = screen.getAllByTestId("rich-text-editor");
      expect(richTextEditors[0]).toHaveValue("Draft feedback");
    });
  });

  describe("criteria ordering", () => {
    it("displays criteria in correct display_order", async () => {
      const configWithReorderedCriteria: PortalReviewConfig = {
        ...mockReviewConfig,
        criteria: [
          createCriterion("crit-2", "Second Criterion", 2, [
            createQuestion("q-2", "Second Question", 1),
          ]),
          createCriterion("crit-1", "First Criterion", 1, [
            createQuestion("q-1", "First Question", 1),
          ]),
        ],
      };

      mockPortalApi.get.mockResolvedValueOnce({ data: configWithReorderedCriteria });

      renderWithProviders(<ReviewForm assignmentId="assign-123" />);

      await waitFor(() => {
        expect(screen.getByText("First Criterion")).toBeInTheDocument();
      });

      // Get criterion title headings (h3 elements with font-semibold)
      const criterionHeadings = screen.getAllByRole("heading", { level: 3 });
      // Filter to only criterion titles (not "Review" heading)
      const criterionTitles = criterionHeadings.filter(
        (h) => h.textContent?.includes("Criterion")
      );
      expect(criterionTitles[0]).toHaveTextContent("First Criterion");
      expect(criterionTitles[1]).toHaveTextContent("Second Criterion");
    });
  });
});
