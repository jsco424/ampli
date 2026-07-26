// Retires any tracked KEYWORD topic — the original curated set included —
// once it's gone cold for a sustained stretch, so this reflects what's
// actually trending right now rather than accumulating a permanent list
// that just gets re-scored forever. Retirement isn't permanent: if
// discoverTopics.ts sees a retired topic trending again later, it gets
// reactivated rather than treated as unknown (see discoverTopics.ts).
//
// Deliberately excludes category='company' — a tracked company is a
// research record tied to real client work, not a trending-signal
// candidate. Losing public interest for a few days shouldn't make a
// company you've actually analyzed disappear from the roster.

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRACE_PERIOD_DAYS = 3 // don't evaluate anything (re)activated more recently than this
const COLD_STREAK_DAYS = 5 // consecutive low-score days needed to retire
const COLD_SCORE_THRESHOLD = 20

export interface PruneResult {
  checked: number
  retired: string[]
}

export async function pruneStaleTopics(): Promise<PruneResult> {
  const graceCutoff = new Date()
  graceCutoff.setDate(graceCutoff.getDate() - GRACE_PERIOD_DAYS)

  // No topic_origin filter — this applies to every keyword topic, curated
  // or discovered alike. The only exclusion is category='company' (see
  // comment above) — the only thing otherwise exempting a topic from
  // evaluation is the grace period on discovered_at.
  const { data: candidates } = await supabaseAdmin
    .from('trend_topics')
    .select('topic, discovered_at')
    .eq('active', true)
    .neq('category', 'company')
    .lt('discovered_at', graceCutoff.toISOString())

  const retired: string[] = []

  for (const row of candidates || []) {
    const { data: recent } = await supabaseAdmin
      .from('trend_composite')
      .select('composite_score, as_of')
      .eq('topic', row.topic)
      .order('as_of', { ascending: false })
      .limit(COLD_STREAK_DAYS)

    if (!recent || recent.length < COLD_STREAK_DAYS) continue // not enough history yet
    // composite_score can come back as a numeric-typed JSON string (see
    // trends/page.tsx's toCompositeRow for the confirming example) —
    // coerced here so this is a real numeric comparison.
    const allCold = recent.every((r: any) => Number(r.composite_score) < COLD_SCORE_THRESHOLD)
    if (!allCold) continue

    await supabaseAdmin
      .from('trend_topics')
      .update({ active: false, last_active_at: recent[0].as_of })
      .eq('topic', row.topic)

    retired.push(row.topic)
  }

  return { checked: (candidates || []).length, retired }
}
