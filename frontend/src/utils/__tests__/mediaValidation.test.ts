import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ACCEPTED_IMAGE_FORMATS,
  ACCEPTED_VIDEO_FORMATS,
  MIN_IMAGE_DIMENSION,
  validateImage,
  validateVideo,
} from "../mediaValidation";

describe("ACCEPTED_IMAGE_FORMATS", () => {
  it("is a comma-separated string of image extensions", () => {
    expect(typeof ACCEPTED_IMAGE_FORMATS).toBe("string");
    expect(ACCEPTED_IMAGE_FORMATS).toContain(".jpg");
    expect(ACCEPTED_IMAGE_FORMATS).toContain(".jpeg");
    expect(ACCEPTED_IMAGE_FORMATS).toContain(".png");
    expect(ACCEPTED_IMAGE_FORMATS).toContain(".webp");
  });

  it("includes professional formats", () => {
    expect(ACCEPTED_IMAGE_FORMATS).toContain(".tiff");
    expect(ACCEPTED_IMAGE_FORMATS).toContain(".bmp");
  });
});

describe("ACCEPTED_VIDEO_FORMATS", () => {
  it("is a comma-separated string of video extensions", () => {
    expect(typeof ACCEPTED_VIDEO_FORMATS).toBe("string");
    expect(ACCEPTED_VIDEO_FORMATS).toContain(".mp4");
    expect(ACCEPTED_VIDEO_FORMATS).toContain(".mov");
    expect(ACCEPTED_VIDEO_FORMATS).toContain(".webm");
  });

  it("includes additional formats", () => {
    expect(ACCEPTED_VIDEO_FORMATS).toContain(".avi");
    expect(ACCEPTED_VIDEO_FORMATS).toContain(".mkv");
  });
});

describe("MIN_IMAGE_DIMENSION", () => {
  it("is a positive number", () => {
    expect(typeof MIN_IMAGE_DIMENSION).toBe("number");
    expect(MIN_IMAGE_DIMENSION).toBeGreaterThan(0);
  });

  it("is set to 600 pixels", () => {
    expect(MIN_IMAGE_DIMENSION).toBe(600);
  });
});

describe("validateVideo", () => {
  it("returns null for video within size limit", () => {
    const file = { size: 5 * 1024 * 1024 } as File; // 5MB
    expect(validateVideo(file, 10)).toBeNull();
  });

  it("returns null for video exactly at size limit", () => {
    const file = { size: 10 * 1024 * 1024 } as File; // 10MB
    expect(validateVideo(file, 10)).toBeNull();
  });

  it("returns error message for video exceeding size limit", () => {
    const file = { size: 15 * 1024 * 1024 } as File; // 15MB
    const result = validateVideo(file, 10);
    expect(result).not.toBeNull();
    expect(result).toContain("10MB");
    expect(result).toContain("15.0MB");
  });

  it("formats size with one decimal place", () => {
    const file = { size: 12.567 * 1024 * 1024 } as File;
    const result = validateVideo(file, 10);
    expect(result).toContain("12.6MB");
  });

  it("handles very small files", () => {
    const file = { size: 100 } as File; // 100 bytes
    expect(validateVideo(file, 10)).toBeNull();
  });

  it("handles zero size files", () => {
    const file = { size: 0 } as File;
    expect(validateVideo(file, 10)).toBeNull();
  });
});

describe("validateImage", () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let originalImage: typeof Image;

  beforeEach(() => {
    mockCreateObjectURL = vi.fn().mockReturnValue("blob:test-url");
    mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
    originalImage = global.Image;
  });

  afterEach(() => {
    global.Image = originalImage;
    vi.restoreAllMocks();
  });

  it("returns null for valid image dimensions", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 800;
      height = 600;

      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    global.Image = MockImage as unknown as typeof Image;

    const file = new File([""], "test.jpg", { type: "image/jpeg" });
    const result = await validateImage(file);

    expect(result).toBeNull();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });

  it("returns error for image below minimum dimensions", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 400;
      height = 300;

      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    global.Image = MockImage as unknown as typeof Image;

    const file = new File([""], "test.jpg", { type: "image/jpeg" });
    const result = await validateImage(file);

    expect(result).not.toBeNull();
    expect(result).toContain("600");
    expect(result).toContain("400");
    expect(result).toContain("300");
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });

  it("returns error when only width is below minimum", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 500;
      height = 800;

      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    global.Image = MockImage as unknown as typeof Image;

    const file = new File([""], "test.jpg", { type: "image/jpeg" });
    const result = await validateImage(file);

    expect(result).not.toBeNull();
    expect(result).toContain("500");
  });

  it("returns error when only height is below minimum", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 800;
      height = 500;

      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    global.Image = MockImage as unknown as typeof Image;

    const file = new File([""], "test.jpg", { type: "image/jpeg" });
    const result = await validateImage(file);

    expect(result).not.toBeNull();
    expect(result).toContain("500");
  });

  it("returns error on image load failure", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 0;
      height = 0;

      constructor() {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    global.Image = MockImage as unknown as typeof Image;

    const file = new File([""], "test.jpg", { type: "image/jpeg" });
    const result = await validateImage(file);

    expect(result).not.toBeNull();
    expect(result).toContain("Could not read image file");
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });

  it("accepts image exactly at minimum dimensions", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 600;
      height = 600;

      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    global.Image = MockImage as unknown as typeof Image;

    const file = new File([""], "test.jpg", { type: "image/jpeg" });
    const result = await validateImage(file);

    expect(result).toBeNull();
  });
});
