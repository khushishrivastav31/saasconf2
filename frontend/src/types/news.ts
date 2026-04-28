export interface NewsArticle {
  id: string;
  tenant_id: string;
  conference_id: string | null;
  domain?: 'conference' | 'training';
  title: string;
  body_html: string;
  is_published: boolean;
  published_at: string | null;
  screen_overlay_id: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsArticleListResponse {
  items: NewsArticle[];
  total: number;
}
