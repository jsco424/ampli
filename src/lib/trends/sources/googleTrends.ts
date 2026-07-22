// Unofficial Google Trends "daily trending searches" fetcher.
//
// IMPORTANT — this hits an undocumented, unofficial Google endpoint
// (trends.google.com/trends/api/dailytrends). There is no official public
// API for this data. Google can change the response shape or start
// blocking server-side requests (rate limiting, CAPTCHA) at any time
// without notice — this source is meaningfully less durable than either
// Wikipedia or YouTube's real APIs, and worth watching if it silently
// starts returning nothing. Every call here fails soft, same pattern as
// the other source fetchers.

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
// figure for each. Unlike wikipedia.ts/youtube.ts, this is not a per-topic
// query — it's Google's own top-N list for the day, which is what makes it
// usable both as a discovery feed (see discoverTopics.ts) and, for topics
// already being tracked, as a third daily raw signal (see findTodayTraffic
// below).
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
    // Response is prefixed with )]}'  before the real JSON body.
    const jsonText = text.replace(/^\)\]\}',?\s*/, '')
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

// For a topic already being tracked, returns today's raw signal value from
// the daily trending list — the term's approxTraffic if it appears in
// today's list, otherwise 0. A 0 here is a legitimate reading (the topic
// simply isn't trending today), not an error, same convention as a
// Wikipedia 404 returning 0 upstream.
export function findTodayTraffic(topic: string, todaysList: GoogleTrendCandidate[]): number {
  const match = todaysList.find((c) => c.term.toLowerCase() === topic.toLowerCase())
  return match ? match.approxTraffic : 0
}
