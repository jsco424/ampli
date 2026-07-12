import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SEED_TOPICS } from '@/lib/trends/seedTopics'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// One-time setup route — inserts the Phase 1 seed topic list into
// trend_topics. Safe to call more than once (upserts on the unique
// `topic` constraint), but this is meant to be run manually once from
// your browser or curl, not on any recurring schedule. After running it,
// manage topics by editing the trend_topics table directly rather than
// re-running this — re-running won't remove topics you've since deleted
// or deactivated there.
//
// This isn't cron-triggered, so Vercel won't auto-send the header here —
// call it manually with: curl -X POST https://am-pli.com/api/trends/seed
//   -H "Authorization: Bearer <your CRON_SECRET value>"
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = SEED_TOPICS.map((t) => ({
    topic: t.topic,
    category: t.category,
    wikipedia_article: t.wikipedia_article,
    reddit_subreddits: t.reddit_subreddits,
    reddit_query: t.reddit_query,
    youtube_query: t.youtube_query,
    active: true,
  }))

  const { error } = await supabaseAdmin.from('trend_topics').upsert(rows, { onConflict: 'topic' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, topicsSeeded: rows.length })
}
