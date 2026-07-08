import type { Paper } from '../types';

/** Average of submitted review scores for a paper, or `null` if none are scored yet. */
export function getAverageScore(paper: Paper): number | null {
  const scored = paper.review_summaries.filter((r) => r.total_score != null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, r) => sum + r.total_score!, 0) / scored.length;
}
