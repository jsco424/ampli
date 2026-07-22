// Retires discovered topics that have gone cold, so the tracked list stays
// current instead of accumulating every term that was ever briefly
// trending. Only ever touches topics with topic_origin = 'discovered' —
// the original 18 curated seed topics are a permanent baseline and are
// never auto-retired here, since those were deliberately chosen as
// evergreen categories rather than fleeting keywords.

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRACE_PERIOD_DAYS = 3 // don't evaluate anything discovered more recently than this
const COLD_STREAK_DAYS = 5 // consecutive low-score days needed to retire
const COLD_SCORE_THRESHOLD = 20

export interface PruneResult {
  checked: number
  retired: string[]
}

export async function pruneStaleTopics(): Promise<PruneResult> {
  const graceCutoff = new Date()
  graceCutoff.setDate(graceCutoff.getDate() - GRACE_PERIOD_DAYS)

  const { data: candidates } = await supabaseAdmin
    .from('trend_topics')
    .select('topic, discovered_at')
    .eq('topic_origin', 'discovered')
    .eq('active', true)
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
    const allCold = recent.every((r: any) => r.composite_score < COLD_SCORE_THRESHOLD)
    if (!allCold) continue

    await supabaseAdmin
      .from('trend_topics')
      .update({ active: false, last_active_at: recent[0].as_of })
      .eq('topic', row.topic)

    retired.push(row.topic)
  }

  return { checked: (candidates || []).length, retired }
}
