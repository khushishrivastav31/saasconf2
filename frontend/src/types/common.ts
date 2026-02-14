// Pagination types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// Shared contact person type (used by locations, sponsors, invoices, service providers)
export interface LocationContactPerson {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  comment?: string;
}

// Social links (used by conferences)
export interface SocialLinks {
  linkedin?: string;
  bluesky?: string;
  mastodon?: string;
  reddit?: string;
  tiktok?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  youtube?: string;
  [key: string]: string | undefined;
}
