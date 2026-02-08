import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AttachmentList from "../AttachmentList";

// Mock the api module
vi.mock("../../config/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Import the mocked api to use in tests
import api from "../../config/api";

const mockApi = vi.mocked(api);

// Mock ConfirmDialog component
vi.mock("../ConfirmDialog", () => ({
  default: ({
    open,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="confirm-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  },
}));

const mockAttachments = [
  {
    id: "att-1",
    tenant_id: "tenant-1",
    entity_type: "paper",
    entity_id: "paper-1",
    filename: "document.pdf",
    content_type: "application/pdf",
    file_size: 1024 * 1024, // 1 MB
    description: "Test document",
    uploaded_by: "user-1",
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "att-2",
    tenant_id: "tenant-1",
    entity_type: "paper",
    entity_id: "paper-1",
    filename: "image.png",
    content_type: "image/png",
    file_size: 512 * 1024, // 512 KB
    description: null,
    uploaded_by: "user-1",
    created_at: "2024-01-16T10:00:00Z",
    updated_at: "2024-01-16T10:00:00Z",
  },
];

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
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

describe("AttachmentList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("shows loading state initially", () => {
      mockApi.get.mockImplementation(() => new Promise(() => {})); // Never resolves
      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );
      expect(screen.getByText("Loading attachments...")).toBeInTheDocument();
    });

    it("renders attachments list when data is loaded", async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { items: mockAttachments, total: 2 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("document.pdf")).toBeInTheDocument();
      });

      expect(screen.getByText("image.png")).toBeInTheDocument();
      expect(screen.getByText(/1\.0 MB/)).toBeInTheDocument();
      expect(screen.getByText(/512\.0 KB/)).toBeInTheDocument();
      expect(screen.getByText(/Test document/)).toBeInTheDocument();
    });

    it("shows empty state when no attachments exist", async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("No attachments yet.")).toBeInTheDocument();
      });
    });

    it("renders the Attachments heading", async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("Attachments")).toBeInTheDocument();
      });
    });

    it("renders upload form elements", async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Description (optional)")
        ).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    });
  });

  describe("delete functionality", () => {
    it("opens confirm dialog when delete button is clicked", async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { items: mockAttachments, total: 2 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("document.pdf")).toBeInTheDocument();
      });

      // Find delete button (has title="Delete")
      const deleteButtons = screen.getAllByTitle("Delete");
      await user.click(deleteButtons[0]);

      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
      expect(screen.getByText("Delete Attachment")).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to delete "document.pdf"/)
      ).toBeInTheDocument();
    });

    it("calls delete API when confirmed", async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { items: mockAttachments, total: 2 },
      });
      mockApi.delete.mockResolvedValueOnce({});

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("document.pdf")).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle("Delete");
      await user.click(deleteButtons[0]);

      const confirmButton = screen.getByRole("button", { name: "Confirm" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockApi.delete).toHaveBeenCalledWith("/attachments/att-1");
      });
    });

    it("closes dialog when cancelled", async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { items: mockAttachments, total: 2 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("document.pdf")).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle("Delete");
      await user.click(deleteButtons[0]);

      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancelButton);

      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });
  });

  describe("file upload", () => {
    it("uploads file when Upload button is clicked", async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });
      mockApi.post.mockResolvedValueOnce({
        data: mockAttachments[0],
      });
      // Re-fetch after upload
      mockApi.get.mockResolvedValueOnce({
        data: { items: [mockAttachments[0]], total: 1 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("No attachments yet.")).toBeInTheDocument();
      });

      // Create a mock file
      const file = new File(["test content"], "test-file.pdf", {
        type: "application/pdf",
      });

      // Get the file input
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      await user.upload(fileInput, file);

      // Click upload button
      const uploadButton = screen.getByRole("button", { name: "Upload" });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith(
          "/attachments",
          expect.any(FormData),
          { headers: { "Content-Type": "multipart/form-data" } }
        );
      });
    });

    it("includes description in upload when provided", async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });
      mockApi.post.mockResolvedValueOnce({
        data: mockAttachments[0],
      });
      mockApi.get.mockResolvedValueOnce({
        data: { items: [mockAttachments[0]], total: 1 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("No attachments yet.")).toBeInTheDocument();
      });

      // Type description
      const descriptionInput = screen.getByPlaceholderText(
        "Description (optional)"
      );
      await user.type(descriptionInput, "My test description");

      // Create and upload a file
      const file = new File(["test content"], "test-file.pdf", {
        type: "application/pdf",
      });
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      await user.upload(fileInput, file);

      const uploadButton = screen.getByRole("button", { name: "Upload" });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalled();
      });

      // Check that the FormData was constructed with the description
      const callArgs = mockApi.post.mock.calls[0];
      const formData = callArgs[1] as FormData;
      expect(formData.get("description")).toBe("My test description");
    });

    it("shows uploading state during upload", async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      // Create a delayed promise to simulate upload in progress
      let resolveUpload: (value: unknown) => void;
      mockApi.post.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("No attachments yet.")).toBeInTheDocument();
      });

      const file = new File(["test"], "test.pdf", { type: "application/pdf" });
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      await user.upload(fileInput, file);

      const uploadButton = screen.getByRole("button", { name: "Upload" });
      await user.click(uploadButton);

      // Should show uploading state
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Uploading..." })
        ).toBeInTheDocument();
      });

      // Resolve the upload
      resolveUpload!({ data: mockAttachments[0] });
    });

    it("shows error message when upload fails", async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });
      mockApi.post.mockRejectedValueOnce(new Error("Upload failed"));

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("No attachments yet.")).toBeInTheDocument();
      });

      const file = new File(["test"], "test.pdf", { type: "application/pdf" });
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      await user.upload(fileInput, file);

      const uploadButton = screen.getByRole("button", { name: "Upload" });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(
          screen.getByText("Upload failed. Please try again.")
        ).toBeInTheDocument();
      });
    });

    it("does not upload if no file is selected", async () => {
      const user = userEvent.setup();
      mockApi.get.mockResolvedValueOnce({
        data: { items: [], total: 0 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("No attachments yet.")).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole("button", { name: "Upload" });
      await user.click(uploadButton);

      // Should not call the API since no file was selected
      expect(mockApi.post).not.toHaveBeenCalled();
    });
  });

  describe("download functionality", () => {
    it("renders download button for each attachment", async () => {
      mockApi.get.mockResolvedValueOnce({
        data: { items: mockAttachments, total: 2 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText("document.pdf")).toBeInTheDocument();
      });

      const downloadButtons = screen.getAllByTitle("Download");
      expect(downloadButtons).toHaveLength(2);
    });
  });

  describe("file size formatting", () => {
    it("formats bytes correctly", async () => {
      const smallAttachment = {
        ...mockAttachments[0],
        id: "att-small",
        file_size: 500, // 500 bytes
      };
      mockApi.get.mockResolvedValueOnce({
        data: { items: [smallAttachment], total: 1 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText(/500 B/)).toBeInTheDocument();
      });
    });

    it("formats kilobytes correctly", async () => {
      const kbAttachment = {
        ...mockAttachments[0],
        id: "att-kb",
        file_size: 1536, // 1.5 KB
      };
      mockApi.get.mockResolvedValueOnce({
        data: { items: [kbAttachment], total: 1 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText(/1\.5 KB/)).toBeInTheDocument();
      });
    });

    it("formats megabytes correctly", async () => {
      const mbAttachment = {
        ...mockAttachments[0],
        id: "att-mb",
        file_size: 2.5 * 1024 * 1024, // 2.5 MB
      };
      mockApi.get.mockResolvedValueOnce({
        data: { items: [mbAttachment], total: 1 },
      });

      renderWithProviders(
        <AttachmentList entityType="paper" entityId="paper-1" />
      );

      await waitFor(() => {
        expect(screen.getByText(/2\.5 MB/)).toBeInTheDocument();
      });
    });
  });
});
