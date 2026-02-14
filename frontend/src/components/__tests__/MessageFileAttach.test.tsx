import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageFileAttach from "../MessageFileAttach";
import type { StagedAttachment } from "../MessageFileAttach";

// Mock axios instance
function createMockApiClient() {
  return {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  } as unknown as import("axios").AxiosInstance;
}

describe("MessageFileAttach", () => {
  let mockApiClient: ReturnType<typeof createMockApiClient>;
  let onAttachmentsChange: ReturnType<typeof vi.fn>;

  const defaultProps = () => ({
    apiClient: mockApiClient,
    uploadPath: "/api/attachments/upload",
    attachments: [] as StagedAttachment[],
    onAttachmentsChange,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient = createMockApiClient();
    onAttachmentsChange = vi.fn();
  });

  describe("rendering the attach button", () => {
    it('renders the "Attach file" button', () => {
      render(<MessageFileAttach {...defaultProps()} />);
      expect(screen.getByText("Attach file")).toBeInTheDocument();
    });

    it("renders a hidden file input", () => {
      const { container } = render(<MessageFileAttach {...defaultProps()} />);
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveClass("hidden");
    });

    it("renders a paperclip icon in the attach button", () => {
      const { container } = render(<MessageFileAttach {...defaultProps()} />);
      const svg = container.querySelector("label svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("staged attachments display", () => {
    const sampleAttachments: StagedAttachment[] = [
      {
        id: "att-1",
        filename: "presentation.pdf",
        content_type: "application/pdf",
        file_size: 2048576, // ~2 MB
      },
      {
        id: "att-2",
        filename: "photo.png",
        content_type: "image/png",
        file_size: 512000, // ~500 KB
      },
    ];

    it("displays staged attachment filenames", () => {
      render(
        <MessageFileAttach
          {...defaultProps()}
          attachments={sampleAttachments}
        />
      );
      expect(screen.getByText("presentation.pdf")).toBeInTheDocument();
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });

    it("displays formatted file sizes", () => {
      render(
        <MessageFileAttach
          {...defaultProps()}
          attachments={sampleAttachments}
        />
      );
      // 2048576 bytes = 2.0 MB
      expect(screen.getByText("2.0 MB")).toBeInTheDocument();
      // 512000 bytes = 500.0 KB
      expect(screen.getByText("500.0 KB")).toBeInTheDocument();
    });

    it("displays file size in bytes for very small files", () => {
      const tinyAttachment: StagedAttachment[] = [
        {
          id: "att-tiny",
          filename: "tiny.txt",
          content_type: "text/plain",
          file_size: 128,
        },
      ];
      render(
        <MessageFileAttach
          {...defaultProps()}
          attachments={tinyAttachment}
        />
      );
      expect(screen.getByText("128 B")).toBeInTheDocument();
    });

    it("does not render the attachments section when there are no attachments", () => {
      const { container } = render(
        <MessageFileAttach {...defaultProps()} attachments={[]} />
      );
      // The "space-y-1" container for attachments should not be present
      const attachmentsList = container.querySelector("div.space-y-1");
      expect(attachmentsList).not.toBeInTheDocument();
    });

    it("renders a remove button for each attachment", () => {
      render(
        <MessageFileAttach
          {...defaultProps()}
          attachments={sampleAttachments}
        />
      );
      const removeButtons = screen.getAllByTitle("Remove");
      expect(removeButtons).toHaveLength(2);
    });
  });

  describe("removing attachments", () => {
    const sampleAttachments: StagedAttachment[] = [
      {
        id: "att-1",
        filename: "presentation.pdf",
        content_type: "application/pdf",
        file_size: 2048576,
      },
      {
        id: "att-2",
        filename: "photo.png",
        content_type: "image/png",
        file_size: 512000,
      },
    ];

    it("calls onAttachmentsChange without the removed attachment when remove is clicked", async () => {
      const user = userEvent.setup();
      render(
        <MessageFileAttach
          {...defaultProps()}
          attachments={sampleAttachments}
        />
      );

      const removeButtons = screen.getAllByTitle("Remove");
      // Remove the first attachment (presentation.pdf)
      await user.click(removeButtons[0]);

      expect(onAttachmentsChange).toHaveBeenCalledOnce();
      expect(onAttachmentsChange).toHaveBeenCalledWith([
        {
          id: "att-2",
          filename: "photo.png",
          content_type: "image/png",
          file_size: 512000,
        },
      ]);
    });

    it("calls onAttachmentsChange without the second attachment when its remove button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <MessageFileAttach
          {...defaultProps()}
          attachments={sampleAttachments}
        />
      );

      const removeButtons = screen.getAllByTitle("Remove");
      // Remove the second attachment (photo.png)
      await user.click(removeButtons[1]);

      expect(onAttachmentsChange).toHaveBeenCalledOnce();
      expect(onAttachmentsChange).toHaveBeenCalledWith([
        {
          id: "att-1",
          filename: "presentation.pdf",
          content_type: "application/pdf",
          file_size: 2048576,
        },
      ]);
    });

    it("calls onAttachmentsChange with empty array when removing the only attachment", async () => {
      const user = userEvent.setup();
      const singleAttachment: StagedAttachment[] = [
        {
          id: "att-1",
          filename: "document.pdf",
          content_type: "application/pdf",
          file_size: 1024,
        },
      ];
      render(
        <MessageFileAttach
          {...defaultProps()}
          attachments={singleAttachment}
        />
      );

      const removeButton = screen.getByTitle("Remove");
      await user.click(removeButton);

      expect(onAttachmentsChange).toHaveBeenCalledOnce();
      expect(onAttachmentsChange).toHaveBeenCalledWith([]);
    });
  });

  describe("uploading state", () => {
    it('shows "Uploading..." text during upload', async () => {
      // Make the post hang so we can see the uploading state
      (mockApiClient.post as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise(() => {}) // never resolves
      );

      const { container } = render(
        <MessageFileAttach {...defaultProps()} />
      );

      const fileInput = container.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      // Simulate file selection
      const file = new File(["hello"], "test.txt", { type: "text/plain" });
      await userEvent.upload(fileInput, file);

      expect(screen.getByText("Uploading...")).toBeInTheDocument();
    });

    it("disables file input while uploading", async () => {
      (mockApiClient.post as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise(() => {})
      );

      const { container } = render(
        <MessageFileAttach {...defaultProps()} />
      );

      const fileInput = container.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      const file = new File(["hello"], "test.txt", { type: "text/plain" });
      await userEvent.upload(fileInput, file);

      expect(fileInput).toBeDisabled();
    });
  });

  describe("successful upload", () => {
    it("calls onAttachmentsChange with the new attachment after successful upload", async () => {
      (mockApiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          id: "new-att-1",
          filename: "report.pdf",
          content_type: "application/pdf",
          file_size: 4096,
        },
      });

      const { container } = render(
        <MessageFileAttach {...defaultProps()} />
      );

      const fileInput = container.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["data"], "report.pdf", {
        type: "application/pdf",
      });
      await userEvent.upload(fileInput, file);

      expect(onAttachmentsChange).toHaveBeenCalledWith([
        {
          id: "new-att-1",
          filename: "report.pdf",
          content_type: "application/pdf",
          file_size: 4096,
        },
      ]);
    });

    it("appends to existing attachments on successful upload", async () => {
      const existing: StagedAttachment[] = [
        {
          id: "existing-1",
          filename: "old.pdf",
          content_type: "application/pdf",
          file_size: 1024,
        },
      ];

      (mockApiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          id: "new-att-2",
          filename: "new.pdf",
          content_type: "application/pdf",
          file_size: 2048,
        },
      });

      const { container } = render(
        <MessageFileAttach {...defaultProps()} attachments={existing} />
      );

      const fileInput = container.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["data"], "new.pdf", {
        type: "application/pdf",
      });
      await userEvent.upload(fileInput, file);

      expect(onAttachmentsChange).toHaveBeenCalledWith([
        {
          id: "existing-1",
          filename: "old.pdf",
          content_type: "application/pdf",
          file_size: 1024,
        },
        {
          id: "new-att-2",
          filename: "new.pdf",
          content_type: "application/pdf",
          file_size: 2048,
        },
      ]);
    });
  });

  describe("upload error handling", () => {
    it("displays error message when upload fails with a detail response", async () => {
      (mockApiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue({
        response: { data: { detail: "File too large" } },
      });

      const { container } = render(
        <MessageFileAttach {...defaultProps()} />
      );

      const fileInput = container.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["data"], "huge.bin", {
        type: "application/octet-stream",
      });
      await userEvent.upload(fileInput, file);

      expect(screen.getByText("File too large")).toBeInTheDocument();
    });

    it('displays "Upload failed" when upload fails without a detail response', async () => {
      (mockApiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      const { container } = render(
        <MessageFileAttach {...defaultProps()} />
      );

      const fileInput = container.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["data"], "broken.bin", {
        type: "application/octet-stream",
      });
      await userEvent.upload(fileInput, file);

      expect(screen.getByText("Upload failed")).toBeInTheDocument();
    });

    it("does not call onAttachmentsChange when upload fails", async () => {
      (mockApiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      const { container } = render(
        <MessageFileAttach {...defaultProps()} />
      );

      const fileInput = container.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      const file = new File(["data"], "broken.bin", {
        type: "application/octet-stream",
      });
      await userEvent.upload(fileInput, file);

      expect(onAttachmentsChange).not.toHaveBeenCalled();
    });
  });
});
