import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThreadList from "../ThreadList";
import type { ThreadListItem } from "../../../../../types";

function makeSender(overrides: Partial<ThreadListItem["last_message_sender"]> = {}) {
  return {
    id: "sender-1",
    type: "user" as const,
    first_name: "Alice",
    last_name: "Smith",
    email: "alice@example.com",
    ...overrides,
  };
}

function makeThread(overrides: Partial<ThreadListItem> = {}): ThreadListItem {
  return {
    id: "thread-1",
    subject: "Submission Review",
    last_message_at: new Date().toISOString(),
    last_message_preview: "Thanks for your submission",
    last_message_sender: makeSender(),
    other_participants: [makeSender()],
    unread: false,
    message_count: 3,
    created_at: new Date().toISOString(),
    bulk_id: null,
    ...overrides,
  };
}

describe("ThreadList", () => {
  const defaultProps = {
    threads: [] as ThreadListItem[],
    selectedId: null,
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("empty state", () => {
    it('renders "No messages yet" when threads array is empty', () => {
      render(<ThreadList {...defaultProps} threads={[]} />);
      expect(screen.getByText("No messages yet")).toBeInTheDocument();
    });

    it("applies gray text styling to the empty message", () => {
      render(<ThreadList {...defaultProps} threads={[]} />);
      const message = screen.getByText("No messages yet");
      expect(message.closest("div")).toHaveClass("text-gray-500", "text-center");
    });
  });

  describe("rendering thread items", () => {
    it("renders the recipient name from other_participants", () => {
      const thread = makeThread({
        other_participants: [
          makeSender({ first_name: "Bob", last_name: "Jones" }),
        ],
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });

    it("renders multiple participant names joined by comma", () => {
      const thread = makeThread({
        other_participants: [
          makeSender({ first_name: "Bob", last_name: "Jones" }),
          makeSender({ id: "sender-2", first_name: "Carol", last_name: "Lee" }),
        ],
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      expect(screen.getByText("Bob Jones, Carol Lee")).toBeInTheDocument();
    });

    it('renders "Unknown" when there are no other_participants', () => {
      const thread = makeThread({ other_participants: [] });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      expect(screen.getByText("Unknown")).toBeInTheDocument();
    });

    it("renders the thread subject", () => {
      const thread = makeThread({ subject: "CFP Decision" });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      expect(screen.getByText("CFP Decision")).toBeInTheDocument();
    });

    it("renders the last message preview", () => {
      const thread = makeThread({
        last_message_preview: "We have reviewed your paper",
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      expect(screen.getByText("We have reviewed your paper")).toBeInTheDocument();
    });

    it("does not render preview paragraph when last_message_preview is empty", () => {
      const thread = makeThread({ last_message_preview: "" });
      const { container } = render(
        <ThreadList {...defaultProps} threads={[thread]} />
      );
      // The preview paragraph should not be present
      const previews = container.querySelectorAll("p.text-gray-400");
      expect(previews).toHaveLength(0);
    });

    it("renders multiple threads", () => {
      const threads = [
        makeThread({ id: "t-1", subject: "First Thread" }),
        makeThread({ id: "t-2", subject: "Second Thread" }),
        makeThread({ id: "t-3", subject: "Third Thread" }),
      ];
      render(<ThreadList {...defaultProps} threads={threads} />);
      expect(screen.getByText("First Thread")).toBeInTheDocument();
      expect(screen.getByText("Second Thread")).toBeInTheDocument();
      expect(screen.getByText("Third Thread")).toBeInTheDocument();
    });
  });

  describe("unread indicator", () => {
    it("shows a blue dot for unread threads", () => {
      const thread = makeThread({ unread: true });
      const { container } = render(
        <ThreadList {...defaultProps} threads={[thread]} />
      );
      const blueDot = container.querySelector("span.bg-blue-600.rounded-full");
      expect(blueDot).toBeInTheDocument();
      expect(blueDot).toHaveClass("w-2", "h-2");
    });

    it("does not show a blue dot for read threads", () => {
      const thread = makeThread({ unread: false });
      const { container } = render(
        <ThreadList {...defaultProps} threads={[thread]} />
      );
      const blueDot = container.querySelector("span.bg-blue-600.rounded-full");
      expect(blueDot).not.toBeInTheDocument();
    });

    it("applies semibold font to unread thread recipient name", () => {
      const thread = makeThread({
        unread: true,
        other_participants: [makeSender({ first_name: "Bob", last_name: "Jones" })],
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      const name = screen.getByText("Bob Jones");
      expect(name).toHaveClass("font-semibold");
    });

    it("applies medium font to read thread recipient name", () => {
      const thread = makeThread({
        unread: false,
        other_participants: [makeSender({ first_name: "Bob", last_name: "Jones" })],
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      const name = screen.getByText("Bob Jones");
      expect(name).toHaveClass("font-medium");
      expect(name).not.toHaveClass("font-semibold");
    });

    it("applies font-medium to unread thread subject", () => {
      const thread = makeThread({ unread: true, subject: "Important" });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      const subject = screen.getByText("Important");
      expect(subject).toHaveClass("font-medium", "text-gray-700");
    });
  });

  describe("selected thread highlighting", () => {
    it("highlights the selected thread with blue background and left border", () => {
      const thread = makeThread({ id: "thread-abc" });
      const { container } = render(
        <ThreadList
          {...defaultProps}
          threads={[thread]}
          selectedId="thread-abc"
        />
      );
      const button = container.querySelector("button");
      expect(button).toHaveClass("bg-blue-50", "border-l-2", "border-l-blue-600");
    });

    it("does not highlight non-selected threads", () => {
      const thread = makeThread({ id: "thread-abc" });
      const { container } = render(
        <ThreadList
          {...defaultProps}
          threads={[thread]}
          selectedId="different-thread"
        />
      );
      const button = container.querySelector("button");
      expect(button).not.toHaveClass("border-l-2");
    });

    it("does not highlight any thread when selectedId is null", () => {
      const threads = [
        makeThread({ id: "t-1" }),
        makeThread({ id: "t-2" }),
      ];
      const { container } = render(
        <ThreadList {...defaultProps} threads={threads} selectedId={null} />
      );
      const buttons = container.querySelectorAll("button");
      buttons.forEach((btn) => {
        expect(btn).not.toHaveClass("border-l-2");
      });
    });
  });

  describe("onSelect callback", () => {
    it("calls onSelect with the thread id when a thread is clicked", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const thread = makeThread({ id: "thread-42", subject: "Click me" });
      render(
        <ThreadList
          {...defaultProps}
          threads={[thread]}
          onSelect={onSelect}
        />
      );

      await user.click(screen.getByText("Click me"));
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith("thread-42");
    });

    it("calls onSelect with the correct id when clicking different threads", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const threads = [
        makeThread({ id: "t-1", subject: "Thread One" }),
        makeThread({ id: "t-2", subject: "Thread Two" }),
      ];
      render(
        <ThreadList
          {...defaultProps}
          threads={threads}
          onSelect={onSelect}
        />
      );

      await user.click(screen.getByText("Thread One"));
      expect(onSelect).toHaveBeenCalledWith("t-1");

      await user.click(screen.getByText("Thread Two"));
      expect(onSelect).toHaveBeenCalledWith("t-2");
    });
  });

  describe("date formatting", () => {
    let dateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Fix "now" to 2025-06-15T12:00:00Z (a Sunday)
      dateSpy = vi.spyOn(Date, "now").mockReturnValue(
        new Date("2025-06-15T12:00:00Z").getTime()
      );
      // Also need to mock the Date constructor for `new Date()` inside formatDate
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
      dateSpy?.mockRestore();
    });

    it('shows time for today\'s messages (e.g. "02:30 PM")', () => {
      const todayDate = new Date("2025-06-15T10:30:00Z");
      const thread = makeThread({
        last_message_at: todayDate.toISOString(),
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      // The exact format depends on locale, but it should contain digits and colon
      const dateEl = screen.getByText(/\d{1,2}:\d{2}/);
      expect(dateEl).toBeInTheDocument();
    });

    it('shows "Yesterday" for messages from yesterday', () => {
      const yesterdayDate = new Date("2025-06-14T08:00:00Z");
      const thread = makeThread({
        last_message_at: yesterdayDate.toISOString(),
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      expect(screen.getByText("Yesterday")).toBeInTheDocument();
    });

    it("shows short weekday for messages within the past week", () => {
      // 3 days ago = Thursday June 12
      const threeDaysAgo = new Date("2025-06-12T08:00:00Z");
      const thread = makeThread({
        last_message_at: threeDaysAgo.toISOString(),
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      // Should show short weekday like "Thu" in the date span
      expect(screen.getByText("Thu")).toBeInTheDocument();
    });

    it('shows month and day for older messages (e.g. "Jan 5")', () => {
      const oldDate = new Date("2025-01-05T08:00:00Z");
      const thread = makeThread({
        last_message_at: oldDate.toISOString(),
      });
      render(<ThreadList {...defaultProps} threads={[thread]} />);
      // Should show something like "Jan 5"
      const dateEl = screen.getByText(/Jan\s+5/);
      expect(dateEl).toBeInTheDocument();
    });
  });
});
