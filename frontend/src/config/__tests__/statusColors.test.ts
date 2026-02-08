import { describe, it, expect } from "vitest";
import {
  PAPER_STATUS_COLORS,
  PAPER_STATUS_LABELS,
  LEVEL_LABELS,
  INVITATION_STATUS_COLORS,
  CFP_STATUS_COLORS,
} from "../statusColors";

describe("PAPER_STATUS_COLORS", () => {
  it("is a non-empty object", () => {
    expect(typeof PAPER_STATUS_COLORS).toBe("object");
    expect(Object.keys(PAPER_STATUS_COLORS).length).toBeGreaterThan(0);
  });

  it("contains all expected paper statuses", () => {
    const expectedStatuses = [
      "draft",
      "submitted",
      "in_evaluation",
      "evaluated",
      "final_consideration",
      "accepted",
      "rejected",
    ];
    expectedStatuses.forEach((status) => {
      expect(PAPER_STATUS_COLORS).toHaveProperty(status);
    });
  });

  it("has CSS class strings for all statuses", () => {
    Object.values(PAPER_STATUS_COLORS).forEach((value) => {
      expect(typeof value).toBe("string");
      expect(value).toContain("bg-");
      expect(value).toContain("text-");
    });
  });

  it("uses appropriate colors for key statuses", () => {
    expect(PAPER_STATUS_COLORS.accepted).toContain("green");
    expect(PAPER_STATUS_COLORS.rejected).toContain("red");
    expect(PAPER_STATUS_COLORS.draft).toContain("gray");
    expect(PAPER_STATUS_COLORS.submitted).toContain("blue");
  });

  it("has 7 paper statuses", () => {
    expect(Object.keys(PAPER_STATUS_COLORS).length).toBe(7);
  });
});

describe("PAPER_STATUS_LABELS", () => {
  it("is a non-empty object", () => {
    expect(typeof PAPER_STATUS_LABELS).toBe("object");
    expect(Object.keys(PAPER_STATUS_LABELS).length).toBeGreaterThan(0);
  });

  it("has the same keys as PAPER_STATUS_COLORS", () => {
    const colorKeys = Object.keys(PAPER_STATUS_COLORS).sort();
    const labelKeys = Object.keys(PAPER_STATUS_LABELS).sort();
    expect(labelKeys).toEqual(colorKeys);
  });

  it("has human-readable labels", () => {
    expect(PAPER_STATUS_LABELS.draft).toBe("Draft");
    expect(PAPER_STATUS_LABELS.submitted).toBe("Submitted");
    expect(PAPER_STATUS_LABELS.in_evaluation).toBe("In Evaluation");
    expect(PAPER_STATUS_LABELS.evaluated).toBe("Evaluated");
    expect(PAPER_STATUS_LABELS.final_consideration).toBe("Final Consideration");
    expect(PAPER_STATUS_LABELS.accepted).toBe("Accepted");
    expect(PAPER_STATUS_LABELS.rejected).toBe("Rejected");
  });

  it("all labels are non-empty strings", () => {
    Object.values(PAPER_STATUS_LABELS).forEach((label) => {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

describe("LEVEL_LABELS", () => {
  it("is a non-empty object", () => {
    expect(typeof LEVEL_LABELS).toBe("object");
    expect(Object.keys(LEVEL_LABELS).length).toBeGreaterThan(0);
  });

  it("contains all expected levels", () => {
    const expectedLevels = [
      "beginner",
      "intermediate",
      "advanced",
      "all_levels",
    ];
    expectedLevels.forEach((level) => {
      expect(LEVEL_LABELS).toHaveProperty(level);
    });
  });

  it("has human-readable labels", () => {
    expect(LEVEL_LABELS.beginner).toBe("Beginner");
    expect(LEVEL_LABELS.intermediate).toBe("Intermediate");
    expect(LEVEL_LABELS.advanced).toBe("Advanced");
    expect(LEVEL_LABELS.all_levels).toBe("All Levels");
  });

  it("has 4 levels", () => {
    expect(Object.keys(LEVEL_LABELS).length).toBe(4);
  });
});

describe("INVITATION_STATUS_COLORS", () => {
  it("is a non-empty object", () => {
    expect(typeof INVITATION_STATUS_COLORS).toBe("object");
    expect(Object.keys(INVITATION_STATUS_COLORS).length).toBeGreaterThan(0);
  });

  it("contains all expected invitation statuses", () => {
    const expectedStatuses = ["pending", "accepted", "declined"];
    expectedStatuses.forEach((status) => {
      expect(INVITATION_STATUS_COLORS).toHaveProperty(status);
    });
  });

  it("has CSS class strings for all statuses", () => {
    Object.values(INVITATION_STATUS_COLORS).forEach((value) => {
      expect(typeof value).toBe("string");
      expect(value).toContain("bg-");
      expect(value).toContain("text-");
    });
  });

  it("uses appropriate colors", () => {
    expect(INVITATION_STATUS_COLORS.pending).toContain("amber");
    expect(INVITATION_STATUS_COLORS.accepted).toContain("green");
    expect(INVITATION_STATUS_COLORS.declined).toContain("red");
  });

  it("has 3 invitation statuses", () => {
    expect(Object.keys(INVITATION_STATUS_COLORS).length).toBe(3);
  });
});

describe("CFP_STATUS_COLORS", () => {
  it("is a non-empty object", () => {
    expect(typeof CFP_STATUS_COLORS).toBe("object");
    expect(Object.keys(CFP_STATUS_COLORS).length).toBeGreaterThan(0);
  });

  it("contains all expected CFP statuses", () => {
    const expectedStatuses = ["draft", "open", "closed", "review", "completed"];
    expectedStatuses.forEach((status) => {
      expect(CFP_STATUS_COLORS).toHaveProperty(status);
    });
  });

  it("has CSS class strings for all statuses", () => {
    Object.values(CFP_STATUS_COLORS).forEach((value) => {
      expect(typeof value).toBe("string");
      expect(value).toContain("bg-");
      expect(value).toContain("text-");
    });
  });

  it("uses appropriate colors", () => {
    expect(CFP_STATUS_COLORS.draft).toContain("gray");
    expect(CFP_STATUS_COLORS.open).toContain("green");
    expect(CFP_STATUS_COLORS.closed).toContain("red");
    expect(CFP_STATUS_COLORS.review).toContain("yellow");
    expect(CFP_STATUS_COLORS.completed).toContain("blue");
  });

  it("has 5 CFP statuses", () => {
    expect(Object.keys(CFP_STATUS_COLORS).length).toBe(5);
  });
});

describe("Color consistency across status types", () => {
  it("accepted status is green across different types", () => {
    expect(PAPER_STATUS_COLORS.accepted).toContain("green");
    expect(INVITATION_STATUS_COLORS.accepted).toContain("green");
  });

  it("draft status is gray across different types", () => {
    expect(PAPER_STATUS_COLORS.draft).toContain("gray");
    expect(CFP_STATUS_COLORS.draft).toContain("gray");
  });
});
