// YouTube Data API v3 — free with an API key from Google Cloud Console
// (enable "YouTube Data API v3" on the project, generate an API key).
// Default daily quota is 10,000 units; search.list costs 100 units and
// videos.list costs 1 unit per call, so ~18 seed topics/day uses well
// under 2,000 units — comfortable headroom even after adding Tier 1.5.

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3'

// Returns the sum of view counts across videos published in the last 7
// days matching the query — a rolling "recent attention" proxy, since
// YouTube's API has no equivalent of Wikipedia's historical daily
// pageview endpoint. Two calls: search.list to find recent videos, then
// videos.list to get their actual view counts (search results don't
// include statistics directly).
export async function fetchYoutubeToday(query: string): Promise<number> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not configured')

  const publishedAfter = new Date()
  publishedAfter.setDate(publishedAfter.getDate() - 7)

  const searchUrl =
    `${YOUTUBE_BASE}/search?part=id&type=video&order=viewCount&maxResults=10` +
    `&publishedAfter=${publishedAfter.toISOString()}` +
    `&q=${encodeURIComponent(query)}&key=${apiKey}`

  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) throw new Error(`YouTube search failed for "${query}": ${searchRes.status}`)
  const searchData = await searchRes.json()

  const videoIds: string[] = (searchData.items || [])
    .map((item: any) => item.id?.videoId)
    .filter(Boolean)

  if (videoIds.length === 0) return 0

  const statsUrl = `${YOUTUBE_BASE}/videos?part=statistics&id=${videoIds.join(',')}&key=${apiKey}`
  const statsRes = await fetch(statsUrl)
  if (!statsRes.ok) throw new Error(`YouTube stats failed for "${query}": ${statsRes.status}`)
  const statsData = await statsRes.json()

  return (statsData.items || []).reduce(
    (sum: number, item: any) => sum + parseInt(item.statistics?.viewCount || '0', 10),
    0
  )
}
