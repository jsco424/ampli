// Wikipedia Pageviews API — free, official, no auth required.
// Docs: https://wikimedia.org/api/rest_v1/

const PAGEVIEWS_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article'

function formatDateForApi(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

// Returns pageviews for the most recent available day. Wikimedia's
// pageview data typically has a 1-2 day processing lag, so this fetches
// a small trailing window and returns the most recent day that actually
// has data, rather than assuming "today" is populated yet.
export async function fetchWikipediaToday(article: string): Promise<number> {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 4)

  const url = `${PAGEVIEWS_BASE}/en.wikipedia/all-access/user/${encodeURIComponent(
    article
  )}/daily/${formatDateForApi(start)}/${formatDateForApi(end)}`

  const res = await fetch(url, {
    headers: {
      // Wikimedia asks for a descriptive User-Agent identifying the
      // application and a contact point — not optional per their policy.
      'User-Agent': 'ampli-trends-pipeline/1.0 (https://am-pli.com)',
    },
  })

  if (!res.ok) {
    // 404 is common for brand-new or very low-traffic articles — treat
    // as zero rather than failing the whole pipeline run.
    if (res.status === 404) return 0
    throw new Error(`Wikipedia pageviews failed for "${article}": ${res.status}`)
  }

  const data = await res.json()
  const items = data.items || []
  if (items.length === 0) return 0
  return items[items.length - 1].views
}
