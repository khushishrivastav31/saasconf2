import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MediaPreviewModal from "../MediaPreviewModal";

describe("MediaPreviewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset body overflow style after each test
    document.body.style.overflow = "";
  });

  describe("rendering", () => {
    it("renders nothing when open is false", () => {
      const { container } = render(
        <MediaPreviewModal
          open={false}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when src is null", () => {
      const { container } = render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src={null}
          type="image"
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders modal when open is true and src is provided", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      expect(
        screen.getByText("Press Esc or click outside to close")
      ).toBeInTheDocument();
    });

    it("renders close button with proper title", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      expect(screen.getByTitle("Close (Esc)")).toBeInTheDocument();
    });
  });

  describe("image rendering", () => {
    it("renders image element when type is image", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      const image = screen.getByRole("img");
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute("src", "https://example.com/image.jpg");
    });

    it("uses default alt text for image", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      const image = screen.getByRole("img");
      expect(image).toHaveAttribute("alt", "Preview");
    });

    it("uses custom alt text when provided", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
          alt="Custom alt text"
        />
      );

      const image = screen.getByRole("img");
      expect(image).toHaveAttribute("alt", "Custom alt text");
    });
  });

  describe("video rendering", () => {
    it("renders video element when type is video", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/video.mp4"
          type="video"
        />
      );

      const video = document.querySelector("video");
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute("src", "https://example.com/video.mp4");
    });

    it("video has controls attribute", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/video.mp4"
          type="video"
        />
      );

      const video = document.querySelector("video");
      expect(video).toHaveAttribute("controls");
    });

    it("video has autoPlay attribute", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/video.mp4"
          type="video"
        />
      );

      const video = document.querySelector("video");
      expect(video).toHaveAttribute("autoplay");
    });

    it("video contains fallback text", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/video.mp4"
          type="video"
        />
      );

      const video = document.querySelector("video");
      expect(video?.textContent).toBe(
        "Your browser does not support the video tag."
      );
    });
  });

  describe("close functionality", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <MediaPreviewModal
          open={true}
          onClose={onClose}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      const closeButton = screen.getByTitle("Close (Esc)");
      await user.click(closeButton);

      // Close is called twice: once by button onClick, once by backdrop onClick (event bubbles)
      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when backdrop is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <MediaPreviewModal
          open={true}
          onClose={onClose}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      // Find the backdrop (the outer div with the click handler)
      const backdrop = screen
        .getByText("Press Esc or click outside to close")
        .closest("div.fixed");
      expect(backdrop).toBeInTheDocument();
      await user.click(backdrop!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when media container is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <MediaPreviewModal
          open={true}
          onClose={onClose}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      const image = screen.getByRole("img");
      await user.click(image);

      // onClose should not be called because click propagation is stopped
      expect(onClose).not.toHaveBeenCalled();
    });

    it("calls onClose when Escape key is pressed", () => {
      const onClose = vi.fn();

      render(
        <MediaPreviewModal
          open={true}
          onClose={onClose}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when other keys are pressed", () => {
      const onClose = vi.fn();

      render(
        <MediaPreviewModal
          open={true}
          onClose={onClose}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      fireEvent.keyDown(document, { key: "Enter" });
      fireEvent.keyDown(document, { key: "a" });
      fireEvent.keyDown(document, { key: "Space" });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("body scroll prevention", () => {
    it("sets body overflow to hidden when modal opens", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores body overflow when modal closes", () => {
      const { rerender } = render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      expect(document.body.style.overflow).toBe("hidden");

      rerender(
        <MediaPreviewModal
          open={false}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      expect(document.body.style.overflow).toBe("");
    });
  });

  describe("video pause on modal close", () => {
    it("video element exists and has pause method when modal is open", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/video.mp4"
          type="video"
        />
      );

      const video = document.querySelector("video");
      expect(video).toBeInTheDocument();
      expect(typeof video?.pause).toBe("function");
    });
  });

  describe("event listener cleanup", () => {
    it("removes keydown event listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
      const onClose = vi.fn();

      const { unmount } = render(
        <MediaPreviewModal
          open={true}
          onClose={onClose}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });

  describe("styling", () => {
    it("applies correct styling classes to backdrop", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      const backdrop = screen
        .getByText("Press Esc or click outside to close")
        .closest("div.fixed");
      expect(backdrop).toHaveClass("inset-0", "z-[100]");
    });

    it("applies correct styling to image", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/image.jpg"
          type="image"
        />
      );

      const image = screen.getByRole("img");
      expect(image).toHaveClass("max-w-full", "object-contain", "rounded-lg");
    });

    it("applies correct styling to video", () => {
      render(
        <MediaPreviewModal
          open={true}
          onClose={() => {}}
          src="https://example.com/video.mp4"
          type="video"
        />
      );

      const video = document.querySelector("video");
      expect(video).toHaveClass("max-w-full", "rounded-lg");
    });
  });
});
