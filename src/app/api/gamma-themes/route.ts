import { NextResponse } from 'next/server'

// Returns all available Gamma themes for the authenticated workspace —
// standard themes plus any custom themes created in the Gamma app.
// Used by the brand settings page to let users pick a theme visually
// instead of manually hunting for theme IDs.
export async function GET() {
  const apiKey = process.env.GAMMA_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GAMMA_API_KEY not configured' }, { status: 500 })
  }

  // Fetch all pages — Gamma paginates at 20 by default
  const themes: any[] = []
  let cursor: string | null = null
  let hasMore = true

  while (hasMore) {
    const url = new URL('https://public-api.gamma.app/v1.0/themes')
    url.searchParams.set('limit', '50')
    if (cursor) url.searchParams.set('after', cursor)

    const res = await fetch(url.toString(), {
      headers: { 'X-API-KEY': apiKey },
    })

    if (!res.ok) {
      console.error('Gamma themes fetch failed:', res.status)
      return NextResponse.json(
        { error: 'Failed to fetch themes from Gamma' },
        { status: res.status }
      )
    }

    const data = await res.json()
    themes.push(...(data.data || []))
    hasMore = data.hasMore || false
    cursor = data.nextCursor || null
  }

  return NextResponse.json({ themes })
}
