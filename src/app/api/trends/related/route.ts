import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchRelatedQueries } from '@/lib/trends/sources/googleTrendsRelated'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// How long a cached result is trusted before refetching live. 7 days —
// related-search overlap for a company doesn't meaningfully shift day to
// day, and this keeps live calls to Google's unofficial endpoint rare
// rather than firing on every detail-panel open.
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topic = searchParams.get('topic')
  if (!topic) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 })
  }

  const { data: cached } = await supabaseAdmin
    .from('trend_related_queries')
    .select('related, fetched_at')
    .eq('topic', topic)
    .single()

  const isFresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_MAX_AGE_MS

  if (isFresh) {
    return NextResponse.json({ related: cached.related, cached: true })
  }

  const related = await fetchRelatedQueries(topic)

  // Cache even an empty result — a genuine "nothing related found" is a
  // valid outcome and shouldn't force a live retry on every single
  // detail-panel open until it happens to succeed. Still refreshed after
  // CACHE_MAX_AGE_MS passes, same as a populated result.
  await supabaseAdmin
    .from('trend_related_queries')
    .upsert({ topic, related, fetched_at: new Date().toISOString() }, { onConflict: 'topic' })

  return NextResponse.json({ related, cached: false })
}
