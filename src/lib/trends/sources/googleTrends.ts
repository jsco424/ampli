// Unofficial Google Trends daily trending searches fetcher — still used
// for DISCOVERY (see discoverTopics.ts) unchanged from before. The
// per-topic daily signal this file used to provide (findTodayTraffic,
// checking whether a topic happened to appear in this shared top-~20
// list) has been replaced — see fetchInterestScore below — since that
// check was near-permanently 0 for almost everything tracked: the odds
// of any specific topic landing in a US-wide top-20 list on a given day
// are close to zero regardless of real search interest, which isn't what
// "a daily Google Trends reading per topic" was meant to deliver.
//
// IMPORTANT — this hits an undocumented, unofficial Google endpoint
// (trends.google.com/trends/api/dailytrends). There is no official public
// API for this data. Google can change the response shape or start
// blocking server-side requests (rate limiting, CAPTCHA) at any time
// without notice — this source is meaningfully less durable than either
// Wikipedia or YouTube's real APIs, and worth watching if it silently
// starts returning nothing. Every call here fails soft, same pattern as
// the other source fetchers.

import { fetchWidgetToken, stripJsonPrefix } from './googleTrendsExplore'

export interface GoogleTrendCandidate {
  term: string
  approxTraffic: number // parsed from formattedTraffic, e.g. "200,000+" -> 200000
}

function parseApproxTraffic(formatted: string | undefined): number {
  if (!formatted) return 0
  const cleaned = formatted.replace(/[,+]/g, '').trim()
  const match = cleaned.match(/^([\d.]+)(K|M)?$/i)
  if (!match) return 0
  const num = parseFloat(match[1])
  const unit = match[2]?.toUpperCase()
  if (unit === 'K') return Math.round(num * 1_000)
  if (unit === 'M') return Math.round(num * 1_000_000)
  return Math.round(num)
}

// Returns today's US trending search terms with an approximate traffic
// figure for each. Used only for discovery now (see discoverTopics.ts) —
// classifying today's genuinely trending terms into new candidate topics,
// not as a daily per-topic reading for already-tracked topics.
export async function fetchGoogleTrendsDaily(): Promise<GoogleTrendCandidate[]> {
  try {
    const res = await fetch(
      'https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-300&geo=US&ns=15',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!res.ok) {
      console.error(`Google Trends daily fetch failed: HTTP ${res.status}`)
      return []
    }
    const text = await res.text()
    const jsonText = stripJsonPrefix(text)
    const parsed = JSON.parse(jsonText)
    const days = parsed?.default?.trendingSearchesDays || []
    const todaysSearches = days[0]?.trendingSearches || []

    return todaysSearches
      .map((t: any) => ({
        term: t?.title?.query || '',
        approxTraffic: parseApproxTraffic(t?.formattedTraffic),
      }))
      .filter((c: GoogleTrendCandidate) => c.term.length > 0)
  } catch (err) {
    console.error('Google Trends daily fetch failed:', err)
    return []
  }
}

const MULTILINE_URL = 'https://trends.google.com/trends/api/widgetdata/multiline'

// Real, term-specific interest score — this is the actual per-topic
// Google Trends flow, same two-step token dance as googleTrendsRelated.ts
// (shared via googleTrendsExplore.ts). 'now 7-d' gives daily granularity
// over the last week; the LAST point in the returned series is treated as
// today's reading. Google's own values here are already 0-100, relative
// to the term's own peak within this 7-day window — fed into the existing
// normalizeSignal() pipeline as a raw_value exactly like Wikipedia/
// YouTube's native-unit counts, since that function only cares about
// relative movement over time for THIS topic+source, not the specific
// unit a source happens to report in.
//
// COST NOTE: unlike the old shared-list check (one request covering every
// tracked topic), this is a real per-topic live call — two requests to
// Google's unofficial endpoint for every active topic, every day. That's
// a meaningful increase in request volume against a source that can
// silently block or rate-limit at any time. Confirmed as an accepted
// tradeoff before building this, not an oversight.
export async function fetchInterestScore(term: string): Promise<number> {
  try {
    const tokenInfo = await fetchWidgetToken(term, 'TIMESERIES', 'now 7-d')
    if (!tokenInfo) return 0

    const url = `${MULTILINE_URL}?hl=en-US&tz=-300&req=${encodeURIComponent(JSON.stringify(tokenInfo.request))}&token=${tokenInfo.token}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) {
      console.error(
        `Google Trends interest-over-time fetch failed for "${term}": HTTP ${res.status}`
      )
      return 0
    }

    const parsed = JSON.parse(stripJsonPrefix(await res.text()))
    const timelineData: any[] = parsed?.default?.timelineData || []
    if (timelineData.length === 0) return 0

    const latest = timelineData[timelineData.length - 1]
    return Number(latest?.value?.[0]) || 0
  } catch (err) {
    console.error(`Interest score fetch failed for "${term}":`, err)
    return 0
  }
}
