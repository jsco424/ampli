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
//
// TWO independent retirement paths, not one — added after noticing steady,
// evergreen topics (a popular car model, a common savings account type)
// were never retiring even though they clearly aren't "trending" in any
// meaningful sense anymore. The reason: normalizeSignal.ts scores a topic
// against its OWN trailing max, so a perfectly flat topic's recent max is
// always roughly equal to today's value — it reads as "at its peak"
// permanently, simply because it never has a real dip to contrast against.
// That means a flat topic can sit at composite_score ≈ 100 forever and
// never trip the absolute cold-score check below.
//
// So retirement now fires on EITHER:
//   (a) absolute cold — composite_score has stayed below COLD_SCORE_THRESHOLD
//       for COLD_STREAK_DAYS straight (the original check, still valid for
//       a topic that had a real spike and genuinely decayed back down), OR
//   (b) flat momentum — delta_vs_prior has stayed within a small band
//       around zero for the same stretch, regardless of the absolute
//       score level (catches the evergreen case above: no real week over
//       week movement in either direction means nothing is actually
//       "trending" about it right now, even if its self-relative score
//       still reads high).
// A topic only needs to satisfy one of the two to retire.

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GRACE_PERIOD_DAYS = 3 // don't evaluate anything (re)activated more recently than this
const COLD_STREAK_DAYS = 5 // consecutive days needed, on either path, to retire
const COLD_SCORE_THRESHOLD = 20
// delta_vs_prior within +/- this many percentage points counts as "no real
// week over week momentum" for the flat-momentum path. Wide enough to
// ignore ordinary day to day noise, narrow enough that a genuine ongoing
// climb or decline still counts as real movement rather than flat.
const FLAT_MOMENTUM_BAND = 10

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
      .select('composite_score, delta_vs_prior, as_of')
      .eq('topic', row.topic)
      .order('as_of', { ascending: false })
      .limit(COLD_STREAK_DAYS)

    if (!recent || recent.length < COLD_STREAK_DAYS) continue // not enough history yet

    // composite_score/delta_vs_prior can come back as numeric-typed JSON
    // strings (see trends/page.tsx's toCompositeRow for the confirming
    // example) — coerced here so both comparisons below are real numeric
    // comparisons, not string comparisons.
    const allColdByScore = recent.every(
      (r: any) => Number(r.composite_score) < COLD_SCORE_THRESHOLD
    )

    // Only counts as flat if every day in the streak actually has a
    // delta to check — a null delta means not enough trailing history to
    // compute one yet (see normalizeSignal), which is a "don't know" state,
    // not evidence of flatness, so it must not be treated as satisfying
    // this path.
    const allFlatByMomentum = recent.every((r: any) => {
      if (r.delta_vs_prior === null || r.delta_vs_prior === undefined) return false
      return Math.abs(Number(r.delta_vs_prior)) <= FLAT_MOMENTUM_BAND
    })

    if (!allColdByScore && !allFlatByMomentum) continue

    await supabaseAdmin
      .from('trend_topics')
      .update({ active: false, last_active_at: recent[0].as_of })
      .eq('topic', row.topic)

    retired.push(row.topic)
  }

  return { checked: (candidates || []).length, retired }
}
