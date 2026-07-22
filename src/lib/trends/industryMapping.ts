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
// Trend categories are no longer a fixed enum (see normalize.ts) — new ones
// can appear over time via discoverTopics.ts's keyword taxonomy. This file
// only needs to list mappings for categories where a real industry fit
// exists; anything not listed here simply has no crowd-industry counterpart
// yet, same as before. Both directions are intentionally partial — return
// null/undefined rather than guessing at a bad match.

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

// trend category -> closest matching crowd industry, or undefined if none
// fits. Partial<Record<...>> rather than an exhaustive Record, since
// TrendCategory is now an open string set — new categories from
// discoverTopics.ts don't need an entry added here unless a real industry
// mapping exists for them.
export const TREND_TO_INDUSTRY: Partial<Record<TrendCategory, CrowdIndustry | null>> = {
  education: 'Education',
  finance: 'Finance',
  tech: 'Technology',
  home: 'Real Estate',
  travel: 'Hospitality',
  auto: null, // no automotive industry currently exists in Crowd Insights
  fitness_wellness: 'Healthcare',
  beauty: 'Retail',
  fashion: 'Retail',
  food_dining: 'Hospitality',
  gaming: 'Technology',
  entertainment: 'Media',
  home_improvement: 'Real Estate',
  // pets, parenting, sports, outdoors: no clean crowd-industry counterpart
  // yet — left unlisted rather than force-mapped.
  // 'company' topics are on-demand tracked companies/competitors, not part
  // of the curated public-interest categories — no crowd industry to map to
  company: null,
}

// crowd industry -> matching trend category, or null if none exists yet.
// Several industries here have no trend category built for them at all —
// that's expected and will fill in as coverage expands.
export const INDUSTRY_TO_TREND: Record<CrowdIndustry, TrendCategory | null> = {
  Education: 'education',
  Finance: 'finance',
  Technology: 'tech',
  'Real Estate': 'home',
  Hospitality: 'travel',
  Retail: 'beauty',
  Healthcare: 'fitness_wellness',
  Media: 'entertainment',
  Marketing: null,
  Manufacturing: null,
  Energy: null,
  Nonprofit: null,
  Logistics: null,
  Other: null,
}
