interface SocialPlatform {
  key: string;
  label: string;
  placeholder: string;
}

/** Social platforms for speaker/applicant profiles */
export const SPEAKER_SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/..." },
  { key: "twitter", label: "Twitter/X", placeholder: "twitter.com/..." },
  { key: "bluesky", label: "BlueSky", placeholder: "bsky.app/profile/..." },
  { key: "mastodon", label: "Mastodon", placeholder: "mastodon.social/@..." },
  { key: "github", label: "GitHub", placeholder: "github.com/..." },
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/..." },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@..." },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@..." },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/..." },
  { key: "website", label: "Website", placeholder: "https://..." },
];

/** Social platforms for conference pages */
export const CONFERENCE_SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/company/..." },
  { key: "twitter", label: "Twitter/X", placeholder: "twitter.com/..." },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/..." },
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/..." },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/..." },
  { key: "bluesky", label: "BlueSky", placeholder: "bsky.app/profile/..." },
  { key: "mastodon", label: "Mastodon", placeholder: "mastodon.social/@..." },
  { key: "reddit", label: "Reddit", placeholder: "reddit.com/r/..." },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@..." },
];
