// Shared types and normalization logic for the trends pipeline.
// Every source fetcher (wikipedia.ts, reddit.ts, youtube.ts, googleTrends.ts)
// returns raw values in its own native unit — pageviews, post count, view
// count, estimated search traffic. This file is what turns those
// incompatible units into one comparable 0-100 scale, using the same
// "100 = own trailing baseline" convention as ampli's existing Crowd
// Insights index, per the roadmap decision.

// Deliberately a plain string, not a fixed union. Categories are no longer
// a hand-maintained enum — discoverTopics.ts classifies new terms against
// an expandable keyword taxonomy, and new categories can appear over time
// without needing a type change here or anywhere downstream (page.tsx,
// industryMapping.ts, etc. all treat this as an open string set with
// fallback display logic for anything not explicitly labeled).
// 'company' remains a reserved value for on-demand tracked
// companies/competitors added per-project — not part of the classified
// public-interest taxonomy, but same tables/pipeline.
export type TrendCategory = string

// google_trends added alongside the original three — same shape as
// wikipedia/youtube (a daily raw value per topic), so it slots into the
// existing composite/signal pipeline without any structural change.
export type TrendSource = 'wikipedia' | 'reddit' | 'youtube' | 'google_trends'

// What a source fetcher returns for one topic on one day — still in that
// source's native unit, not yet comparable across sources.
export interface RawSignal {
  topic: string
  category: TrendCategory
  source: TrendSource
  rawValue: number
  asOf: string // YYYY-MM-DD
}

// After normalization — comparable across topics and sources.
export interface NormalizedSignal {
  topic: string
  category: TrendCategory
  source: TrendSource
  rawValue: number
  signalScore: number // 0-100
  deltaVsPrior: number | null // % change vs. 7 days prior, null if no prior data
  asOf: string
}

// Normalizes one topic+source's raw value against its own trailing window —
// NOT against other topics or other sources. This is deliberate: a topic
// with naturally low absolute volume (e.g. a niche finance term vs. a
// mainstream car model) still gets a meaningful 0-100 score relative to
// its own history, the same way Google Trends scores are self-relative
// rather than true cross-topic comparisons.
//
// trailingValues should be the last ~14 days of raw values for this exact
// topic+source, oldest first, NOT including today's value.
export function normalizeSignal(raw: RawSignal, trailingValues: number[]): NormalizedSignal {
  const allValues = [...trailingValues, raw.rawValue]
  const max = Math.max(...allValues, 1) // avoid divide-by-zero on all-zero history
  const signalScore = Math.round((raw.rawValue / max) * 100)

  // Delta vs. 7 days prior — trailingValues[trailingValues.length - 7] if
  // that much history exists, otherwise null (too early to compute).
  const priorIndex = trailingValues.length - 7
  const priorValue = priorIndex >= 0 ? trailingValues[priorIndex] : null
  const deltaVsPrior =
    priorValue !== null && priorValue !== 0
      ? Math.round(((raw.rawValue - priorValue) / priorValue) * 1000) / 10
      : null

  return {
    topic: raw.topic,
    category: raw.category,
    source: raw.source,
    rawValue: raw.rawValue,
    signalScore,
    deltaVsPrior,
    asOf: raw.asOf,
  }
}
