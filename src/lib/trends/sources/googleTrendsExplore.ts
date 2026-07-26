// Shared first step of Google Trends' unofficial two-step widget flow —
// declares what you want (term/timeframe/geo) via /api/explore, gets back
// tokens for whichever widget you actually need (TIMESERIES for interest-
// over-time, RELATED_QUERIES for related searches, etc.). Both
// googleTrendsRelated.ts and googleTrends.ts's per-topic interest score
// use this same first step, just asking for a different widgetId and
// timeframe afterward — factored out here so this one fragile call exists
// in exactly one place, not duplicated per feature.
//
// Same fragility caveat as everywhere else this unofficial API shows up:
// undocumented, no official support, can change shape or start blocking
// server-side requests at any time.

const EXPLORE_URL = 'https://trends.google.com/trends/api/explore'

export interface WidgetToken {
  token: string
  request: any
}

export function stripJsonPrefix(text: string): string {
  // Both explore and every widget-data endpoint prefix their JSON body
  // with )]}',  as an anti-hijacking measure — not valid JSON on its own.
  return text.replace(/^\)\]\}',?\s*/, '')
}

export async function fetchWidgetToken(
  term: string,
  widgetId: string,
  timeframe: string
): Promise<WidgetToken | null> {
  const reqPayload = {
    comparisonItem: [{ keyword: term, geo: 'US', time: timeframe }],
    category: 0,
    property: '',
  }

  const url = `${EXPLORE_URL}?hl=en-US&tz=-300&req=${encodeURIComponent(JSON.stringify(reqPayload))}`

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) {
      console.error(`Google Trends explore fetch failed for "${term}": HTTP ${res.status}`)
      return null
    }

    const parsed = JSON.parse(stripJsonPrefix(await res.text()))
    const widgets: any[] = parsed?.widgets || []
    const widget = widgets.find((w) => w.id === widgetId)
    if (!widget?.token || !widget?.request) return null

    return { token: widget.token, request: widget.request }
  } catch (err) {
    console.error(`Google Trends explore fetch failed for "${term}":`, err)
    return null
  }
}
