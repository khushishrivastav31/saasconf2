import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PaperStatusLifeline from "../PaperStatusLifeline";

describe("PaperStatusLifeline", () => {
  const stages = ["Draft", "Submitted", "Evaluation", "Reviewed", "Final Consideration"];

  describe("linear stages display", () => {
    it("renders all linear stage labels in default mode", () => {
      render(<PaperStatusLifeline status="draft" />);

      stages.forEach((stage) => {
        expect(screen.getByText(stage)).toBeInTheDocument();
      });
    });

    it("renders Accepted and Rejected labels", () => {
      render(<PaperStatusLifeline status="draft" />);

      expect(screen.getByText("Accepted")).toBeInTheDocument();
      expect(screen.getByText("Rejected")).toBeInTheDocument();
    });
  });

  describe("draft status", () => {
    it("highlights Draft as current stage", () => {
      render(<PaperStatusLifeline status="draft" />);

      const draftLabel = screen.getByText("Draft");
      expect(draftLabel.className).toContain("font-semibold");
    });

    it("shows Draft label in compact mode", () => {
      render(<PaperStatusLifeline status="draft" compact />);

      expect(screen.getByText("Draft")).toBeInTheDocument();
    });
  });

  describe("submitted status", () => {
    it("highlights Submitted as current stage", () => {
      render(<PaperStatusLifeline status="submitted" />);

      const submittedLabel = screen.getByText("Submitted");
      expect(submittedLabel.className).toContain("font-semibold");
    });

    it("shows Draft as completed", () => {
      const { container } = render(<PaperStatusLifeline status="submitted" />);

      // The first dot (Draft) should have green color indicating completed
      const dots = container.querySelectorAll(".rounded-full");
      expect(dots[0].className).toContain("bg-green-500");
    });
  });

  describe("in_evaluation status", () => {
    it("highlights Evaluation as current stage", () => {
      render(<PaperStatusLifeline status="in_evaluation" />);

      const evaluationLabel = screen.getByText("Evaluation");
      expect(evaluationLabel.className).toContain("font-semibold");
    });

    it("shows previous stages as completed", () => {
      const { container } = render(<PaperStatusLifeline status="in_evaluation" />);

      const dots = container.querySelectorAll(".rounded-full");
      // Draft and Submitted should be green
      expect(dots[0].className).toContain("bg-green-500");
      expect(dots[1].className).toContain("bg-green-500");
    });
  });

  describe("evaluated status", () => {
    it("highlights Reviewed as current stage", () => {
      render(<PaperStatusLifeline status="evaluated" />);

      const reviewedLabel = screen.getByText("Reviewed");
      expect(reviewedLabel.className).toContain("font-semibold");
    });
  });

  describe("final_consideration status", () => {
    it("highlights Final Consideration as current stage", () => {
      render(<PaperStatusLifeline status="final_consideration" />);

      const finalLabel = screen.getByText("Final Consideration");
      expect(finalLabel.className).toContain("font-semibold");
    });
  });

  describe("accepted status", () => {
    it("shows accepted styling", () => {
      render(<PaperStatusLifeline status="accepted" />);

      const acceptedLabel = screen.getByText("Accepted");
      expect(acceptedLabel.className).toContain("text-green-600");
      expect(acceptedLabel.className).toContain("font-semibold");
    });

    it("shows all linear stages as completed", () => {
      const { container } = render(<PaperStatusLifeline status="accepted" />);

      // All 5 linear stage dots should be green
      const dots = container.querySelectorAll(".bg-green-500");
      expect(dots.length).toBeGreaterThanOrEqual(5);
    });

    it("shows unicorn icon when accepted", () => {
      const { container } = render(<PaperStatusLifeline status="accepted" />);

      // Check for the SVG unicorn icon
      const svgIcon = container.querySelector("svg.text-green-500");
      expect(svgIcon).toBeInTheDocument();
    });

    it("shows Accepted label in compact mode", () => {
      render(<PaperStatusLifeline status="accepted" compact />);

      expect(screen.getByText("Accepted")).toBeInTheDocument();
    });
  });

  describe("rejected status", () => {
    it("shows rejected styling", () => {
      render(<PaperStatusLifeline status="rejected" />);

      const rejectedLabel = screen.getByText("Rejected");
      expect(rejectedLabel.className).toContain("text-red-600");
      expect(rejectedLabel.className).toContain("font-semibold");
    });

    it("shows all linear stages as completed", () => {
      const { container } = render(<PaperStatusLifeline status="rejected" />);

      // All 5 linear stage dots should be green
      const dots = container.querySelectorAll(".bg-green-500");
      expect(dots.length).toBeGreaterThanOrEqual(5);
    });

    it("shows Rejected label in compact mode", () => {
      render(<PaperStatusLifeline status="rejected" compact />);

      expect(screen.getByText("Rejected")).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("only shows current stage label", () => {
      render(<PaperStatusLifeline status="submitted" compact />);

      expect(screen.getByText("Submitted")).toBeInTheDocument();
      // Other labels should not be visible
      expect(screen.queryByText("Draft")).not.toBeInTheDocument();
      expect(screen.queryByText("Evaluation")).not.toBeInTheDocument();
    });

    it("uses smaller dot sizes", () => {
      const { container } = render(<PaperStatusLifeline status="draft" compact />);

      // Compact uses w-2 h-2 class
      const smallDots = container.querySelectorAll(".w-2.h-2");
      expect(smallDots.length).toBeGreaterThan(0);
    });

    it("uses smaller font size", () => {
      render(<PaperStatusLifeline status="draft" compact />);

      const label = screen.getByText("Draft");
      expect(label.className).toContain("text-[9px]");
    });
  });

  describe("unknown status", () => {
    it("handles unknown status gracefully", () => {
      render(<PaperStatusLifeline status="unknown_status" />);

      // Should still render the component
      expect(screen.getByText("Draft")).toBeInTheDocument();
      expect(screen.getByText("Accepted")).toBeInTheDocument();
    });
  });

  describe("visual indicators", () => {
    it("shows connecting lines between stages", () => {
      const { container } = render(<PaperStatusLifeline status="submitted" />);

      // Check for line elements (h-0.5 divs)
      const lines = container.querySelectorAll(".h-0\\.5");
      expect(lines.length).toBeGreaterThan(0);
    });

    it("shows green lines for completed stages", () => {
      const { container } = render(<PaperStatusLifeline status="in_evaluation" />);

      const greenLines = container.querySelectorAll(".bg-green-500.h-0\\.5");
      expect(greenLines.length).toBeGreaterThan(0);
    });

    it("shows gray lines for future stages", () => {
      const { container } = render(<PaperStatusLifeline status="draft" />);

      const grayLines = container.querySelectorAll(".bg-gray-200.h-0\\.5");
      expect(grayLines.length).toBeGreaterThan(0);
    });

    it("shows ring on current stage dot", () => {
      const { container } = render(<PaperStatusLifeline status="submitted" />);

      const ringDot = container.querySelector(".ring-2");
      expect(ringDot).toBeInTheDocument();
    });
  });
});
