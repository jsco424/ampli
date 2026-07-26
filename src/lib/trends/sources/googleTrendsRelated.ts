// Unofficial Google Trends "related queries" fetcher — a genuinely
// different, more complex flow than googleTrends.ts's daily trending list.
// Uses the shared explore-token step from googleTrendsExplore.ts, then
// requests the RELATED_QUERIES widget's actual data.
//
// IMPORTANT — same fragility class as everywhere else this unofficial API
// shows up: undocumented, no official support, can change shape or start
// blocking server-side requests at any time. Every call here fails soft
// (returns []) so a broken related-queries lookup never takes down the
// topic detail panel it feeds — worst case, that section just doesn't
// show anything.

import { fetchWidgetToken, stripJsonPrefix } from './googleTrendsExplore'

const RELATED_SEARCHES_URL = 'https://trends.google.com/trends/api/widgetdata/relatedsearches'

export interface RelatedQuery {
  query: string
  value: number // Google's own relative-interest value for this related term
}

// Returns up to `limit` related search terms for one company/topic, or []
// if anything in the two-step flow fails — a genuinely empty result and a
// failed request are indistinguishable to the caller by design, since
// neither should ever be treated as an error worth surfacing to the user.
export async function fetchRelatedQueries(term: string, limit = 5): Promise<RelatedQuery[]> {
  try {
    const tokenInfo = await fetchWidgetToken(term, 'RELATED_QUERIES', 'today 3-m')
    if (!tokenInfo) return []

    const url = `${RELATED_SEARCHES_URL}?hl=en-US&tz=-300&req=${encodeURIComponent(JSON.stringify(tokenInfo.request))}&token=${tokenInfo.token}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) {
      console.error(`Google Trends related-searches fetch failed for "${term}": HTTP ${res.status}`)
      return []
    }

    const parsed = JSON.parse(stripJsonPrefix(await res.text()))
    const rankedLists: any[] = parsed?.default?.rankedList || []

    // rankedLists[0] is "TOP" related queries (most co-searched overall),
    // rankedLists[1] is "RISING" (fastest-growing) when present. TOP is
    // the better fit for "who else shows up alongside this company" —
    // RISING skews toward one-off news spikes rather than steady
    // competitive overlap, so it's deliberately not used here.
    const topList = rankedLists[0]?.rankedKeyword || []

    return topList
      .slice(0, limit)
      .map((item: any) => ({ query: item.query, value: Number(item.value) || 0 }))
      .filter((r: RelatedQuery) => r.query && r.query.toLowerCase() !== term.toLowerCase())
  } catch (err) {
    console.error(`Related queries fetch failed for "${term}":`, err)
    return []
  }
}
