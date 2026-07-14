// Maps between the two taxonomies that exist in ampli:
//   - Crowd Insights' INDUSTRIES list (src/lib/dataSummary.ts) — classifies
//     what industry a client's campaign data belongs to
//   - Trend Categories (this feature) — classifies what topic the public
//     is showing interest in
//
// These are NOT the same list and shouldn't be forced into one — they
// measure different things. This file is the explicit bridge between them,
// used by the "Related Trending Topics" cross-link on the Crowd Insights
// page (planned, not yet built) so that viewing, say, the Finance industry
// benchmark can pull in relevant Finance trend topics alongside it.
//
// Not every trend category has a clean industry counterpart (Auto has none
// in the current 14-industry list), and not every industry has a trend
// counterpart (Manufacturing, Media, Energy, Nonprofit, Logistics, Retail,
// Marketing, Other currently have no trend category feeding them). Both
// directions are intentionally partial — return null rather than guessing
// at a bad match.

import type { TrendCategory } from './normalize'

// Crowd Insights' 14-item industry list, exactly as defined in
// src/lib/dataSummary.ts — kept here as a plain type rather than importing
// from dataSummary.ts directly, since that file isn't set up to export it
// and duplicating a string union is safer than reaching into an unrelated
// module's internals for one type.
export type CrowdIndustry =
  | 'Retail'
  | 'Healthcare'
  | 'Technology'
  | 'Finance'
  | 'Marketing'
  | 'Education'
  | 'Manufacturing'
  | 'Hospitality'
  | 'Real Estate'
  | 'Media'
  | 'Energy'
  | 'Nonprofit'
  | 'Logistics'
  | 'Other'

// trend category -> closest matching crowd industry, or null if none fits
export const TREND_TO_INDUSTRY: Record<TrendCategory, CrowdIndustry | null> = {
  education: 'Education',
  finance: 'Finance',
  tech: 'Technology',
  home: 'Real Estate',
  travel: 'Hospitality',
  auto: null, // no automotive industry currently exists in Crowd Insights
  // 'company' topics are on-demand tracked companies/competitors, not part
  // of the curated public-interest categories — no crowd industry to map to
  company: null,
}

// crowd industry -> matching trend category, or null if none exists yet.
// Several industries here have no trend category built for them at all —
// that's expected for Phase 1 (only Auto/Education/Finance topics exist
// right now) and will fill in as Tier 1.5/2 categories get added.
export const INDUSTRY_TO_TREND: Record<CrowdIndustry, TrendCategory | null> = {
  Education: 'education',
  Finance: 'finance',
  Technology: 'tech',
  'Real Estate': 'home',
  Hospitality: 'travel',
  Retail: null,
  Healthcare: null,
  Marketing: null,
  Manufacturing: null,
  Media: null,
  Energy: null,
  Nonprofit: null,
  Logistics: null,
  Other: null,
}
