// Reddit API — requires a free "script" app registration at
// reddit.com/prefs/apps to get REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET.
// Uses the client-credentials OAuth flow (app-only, read-only access —
// no user login needed, appropriate for a read-only pipeline like this).

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not configured')
  }

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ampli-trends-pipeline/1.0',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`)
  const data = await res.json()

  cachedToken = {
    token: data.access_token,
    // Reddit tokens last 1 hour — refresh a little early to be safe.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.token
}

// Returns the count of posts matching a query within a set of subreddits
// over the last 24 hours — today's raw signal value. Multiple subreddits
// are searched together via Reddit's r/sub1+sub2 multi-subreddit syntax.
export async function fetchRedditToday(subreddits: string[], query: string): Promise<number> {
  const token = await getAccessToken()
  const subredditPath = subreddits.join('+')

  const url = `https://oauth.reddit.com/r/${subredditPath}/search?q=${encodeURIComponent(
    query
  )}&restrict_sr=1&sort=new&t=day&limit=100`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'ampli-trends-pipeline/1.0',
    },
  })

  if (!res.ok)
    throw new Error(`Reddit search failed for "${query}" in r/${subredditPath}: ${res.status}`)

  const data = await res.json()
  return (data.data?.children || []).length
}
