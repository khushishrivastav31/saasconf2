import { describe, it, expect } from "vitest";
import {
  SPEAKER_SOCIAL_PLATFORMS,
  CONFERENCE_SOCIAL_PLATFORMS,
} from "../socialPlatforms";

describe("SPEAKER_SOCIAL_PLATFORMS", () => {
  it("is an array of social platform objects", () => {
    expect(Array.isArray(SPEAKER_SOCIAL_PLATFORMS)).toBe(true);
    expect(SPEAKER_SOCIAL_PLATFORMS.length).toBeGreaterThan(0);
  });

  it("contains required platform properties", () => {
    SPEAKER_SOCIAL_PLATFORMS.forEach((platform) => {
      expect(platform).toHaveProperty("key");
      expect(platform).toHaveProperty("label");
      expect(platform).toHaveProperty("placeholder");
      expect(typeof platform.key).toBe("string");
      expect(typeof platform.label).toBe("string");
      expect(typeof platform.placeholder).toBe("string");
    });
  });

  it("has unique keys", () => {
    const keys = SPEAKER_SOCIAL_PLATFORMS.map((p) => p.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("includes common social platforms", () => {
    const keys = SPEAKER_SOCIAL_PLATFORMS.map((p) => p.key);
    expect(keys).toContain("linkedin");
    expect(keys).toContain("twitter");
    expect(keys).toContain("github");
    expect(keys).toContain("website");
  });

  it("includes newer platforms like BlueSky and Mastodon", () => {
    const keys = SPEAKER_SOCIAL_PLATFORMS.map((p) => p.key);
    expect(keys).toContain("bluesky");
    expect(keys).toContain("mastodon");
  });

  it("has 10 speaker platforms", () => {
    expect(SPEAKER_SOCIAL_PLATFORMS.length).toBe(10);
  });

  it("has descriptive placeholders", () => {
    const linkedin = SPEAKER_SOCIAL_PLATFORMS.find((p) => p.key === "linkedin");
    expect(linkedin?.placeholder).toContain("linkedin.com");

    const twitter = SPEAKER_SOCIAL_PLATFORMS.find((p) => p.key === "twitter");
    expect(twitter?.placeholder).toContain("twitter.com");
  });
});

describe("CONFERENCE_SOCIAL_PLATFORMS", () => {
  it("is an array of social platform objects", () => {
    expect(Array.isArray(CONFERENCE_SOCIAL_PLATFORMS)).toBe(true);
    expect(CONFERENCE_SOCIAL_PLATFORMS.length).toBeGreaterThan(0);
  });

  it("contains required platform properties", () => {
    CONFERENCE_SOCIAL_PLATFORMS.forEach((platform) => {
      expect(platform).toHaveProperty("key");
      expect(platform).toHaveProperty("label");
      expect(platform).toHaveProperty("placeholder");
      expect(typeof platform.key).toBe("string");
      expect(typeof platform.label).toBe("string");
      expect(typeof platform.placeholder).toBe("string");
    });
  });

  it("has unique keys", () => {
    const keys = CONFERENCE_SOCIAL_PLATFORMS.map((p) => p.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("includes common social platforms", () => {
    const keys = CONFERENCE_SOCIAL_PLATFORMS.map((p) => p.key);
    expect(keys).toContain("linkedin");
    expect(keys).toContain("twitter");
    expect(keys).toContain("facebook");
  });

  it("includes Reddit for conferences", () => {
    const keys = CONFERENCE_SOCIAL_PLATFORMS.map((p) => p.key);
    expect(keys).toContain("reddit");
  });

  it("does not include GitHub (speaker-specific)", () => {
    const keys = CONFERENCE_SOCIAL_PLATFORMS.map((p) => p.key);
    expect(keys).not.toContain("github");
  });

  it("does not include website (speaker-specific)", () => {
    const keys = CONFERENCE_SOCIAL_PLATFORMS.map((p) => p.key);
    expect(keys).not.toContain("website");
  });

  it("has 9 conference platforms", () => {
    expect(CONFERENCE_SOCIAL_PLATFORMS.length).toBe(9);
  });

  it("uses company-specific placeholder for LinkedIn", () => {
    const linkedin = CONFERENCE_SOCIAL_PLATFORMS.find(
      (p) => p.key === "linkedin",
    );
    expect(linkedin?.placeholder).toContain("company");
  });
});

describe("Platform overlap", () => {
  it("shares common platforms between speaker and conference", () => {
    const speakerKeys = new Set(SPEAKER_SOCIAL_PLATFORMS.map((p) => p.key));
    const conferenceKeys = new Set(
      CONFERENCE_SOCIAL_PLATFORMS.map((p) => p.key),
    );

    const sharedPlatforms = ["linkedin", "twitter", "facebook", "instagram"];
    sharedPlatforms.forEach((platform) => {
      expect(speakerKeys.has(platform)).toBe(true);
      expect(conferenceKeys.has(platform)).toBe(true);
    });
  });
});
