import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchWikipediaToday } from '@/lib/trends/sources/wikipedia'
import { fetchRedditToday } from '@/lib/trends/sources/reddit'
import { fetchYoutubeToday } from '@/lib/trends/sources/youtube'
import { fetchGoogleTrendsDaily, findTodayTraffic } from '@/lib/trends/sources/googleTrends'
import { discoverNewTopics } from '@/lib/trends/discoverTopics'
import { pruneStaleTopics } from '@/lib/trends/pruneTopics'
import { normalizeSignal, type RawSignal, type NormalizedSignal } from '@/lib/trends/normalize'
import { computeComposite } from '@/lib/trends/aggregate'

// Service-role client — this route writes system-level pipeline data,
// not anything scoped to a specific user, so it needs to bypass RLS the
// same way the Gamma export pipeline's re-hosting step does.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TRAILING_DAYS = 14

// Runs once daily via Vercel Cron (see vercel.json). Not meant to be
// triggered from the client — protected via Vercel's standard CRON_SECRET
// convention. Set an env var literally named CRON_SECRET in Vercel, and
// Vercel automatically sends it as the Authorization: Bearer header on
// every cron invocation — no manual header configuration needed for the
// scheduled runs themselves.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const results: { topic: string; source: string; status: 'ok' | 'error'; error?: string }[] = []

  // Discovery runs first, before topics are loaded, so anything newly
  // discovered from today's Google Trends list gets its first signal
  // reading in this same run rather than waiting until tomorrow. A
  // discovery failure (e.g. the unofficial Google endpoint being down or
  // blocked) shouldn't take down the rest of the refresh — same
  // continue-past-failures posture as every per-source fetch below.
  let discovery: { scanned: number; classified: number; added: string[] } = {
    scanned: 0,
    classified: 0,
    added: [],
  }
  try {
    discovery = await discoverNewTopics()
  } catch (err: any) {
    console.error('Topic discovery failed:', err.message)
  }

  // Today's Google Trends list is fetched once for the whole run, not
  // per topic — it's one shared feed that every active topic checks
  // itself against (see findTodayTraffic below), unlike Wikipedia/YouTube
  // which are genuinely per-topic queries.
  const todaysGoogleTrends = await fetchGoogleTrendsDaily()

  const { data: topics, error: topicsError } = await supabaseAdmin
    .from('trend_topics')
    .select('*')
    .eq('active', true)

  if (topicsError || !topics) {
    return NextResponse.json({ error: 'Failed to load trend_topics' }, { status: 500 })
  }

  for (const topic of topics) {
    const signalsForTopic: NormalizedSignal[] = []

    const sourcesToFetch: {
      source: 'wikipedia' | 'reddit' | 'youtube' | 'google_trends'
      fetchFn: () => Promise<number>
    }[] = []

    if (topic.wikipedia_article) {
      sourcesToFetch.push({
        source: 'wikipedia',
        fetchFn: () => fetchWikipediaToday(topic.wikipedia_article),
      })
    }
    // Reddit is skipped entirely until REDDIT_CLIENT_ID/SECRET exist —
    // not attempted-and-logged-as-error. Once those env vars are added
    // (pending Reddit's commercial API approval), this resumes on its
    // own with no code changes needed.
    //
    // reddit_subreddits comes back from Supabase as a JSON-encoded string
    // (e.g. '["personalfinance","investing"]'), not a real array — confirmed
    // against a real export of trend_topics. Parsed defensively here so
    // .length and the array passed to fetchRedditToday are both correct
    // once Reddit actually gets configured; left as-is this would always
    // read as a large truthy string length and hand fetchRedditToday a raw
    // string instead of a subreddit list.
    const redditConfigured = !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET)
    let redditSubreddits: string[] = []
    if (redditConfigured && topic.reddit_subreddits) {
      try {
        redditSubreddits =
          typeof topic.reddit_subreddits === 'string'
            ? JSON.parse(topic.reddit_subreddits)
            : topic.reddit_subreddits
      } catch {
        redditSubreddits = []
      }
    }
    if (redditConfigured && redditSubreddits.length > 0 && topic.reddit_query) {
      sourcesToFetch.push({
        source: 'reddit',
        fetchFn: () => fetchRedditToday(redditSubreddits, topic.reddit_query),
      })
    }
    if (topic.youtube_query) {
      sourcesToFetch.push({
        source: 'youtube',
        fetchFn: () => fetchYoutubeToday(topic.youtube_query),
      })
    }
    // Google Trends checks this topic against today's already-fetched
    // trending list — a 0 here means "not in today's top trending
    // searches," a legitimate reading, not a failure, so every active
    // topic gets a signal row for this source every day (unlike the
    // discovery feed itself, which only ever contributes brand new
    // topics, not daily readings for existing ones).
    sourcesToFetch.push({
      source: 'google_trends',
      fetchFn: async () => findTodayTraffic(topic.topic, todaysGoogleTrends),
    })

    for (const { source, fetchFn } of sourcesToFetch) {
      try {
        const rawValue = await fetchFn()

        // Pull trailing raw_value history from our own storage — not
        // re-derived from the source each run. This is what lets YouTube
        // and Google Trends (neither of which has a historical endpoint
        // we can query) work the same way as Wikipedia: today's value
        // plus whatever we've already accumulated ourselves.
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - TRAILING_DAYS)
        const { data: history } = await supabaseAdmin
          .from('trend_signals')
          .select('raw_value, as_of')
          .eq('topic', topic.topic)
          .eq('source', source)
          .gte('as_of', cutoff.toISOString().slice(0, 10))
          .order('as_of', { ascending: true })

        const trailingValues = (history || []).map((h) => Number(h.raw_value))

        const raw: RawSignal = {
          topic: topic.topic,
          category: topic.category,
          source,
          rawValue,
          asOf: today,
        }
        const normalized = normalizeSignal(raw, trailingValues)
        signalsForTopic.push(normalized)

        await supabaseAdmin.from('trend_signals').upsert(
          {
            topic: normalized.topic,
            category: normalized.category,
            source: normalized.source,
            raw_value: normalized.rawValue,
            signal_score: normalized.signalScore,
            delta_vs_prior: normalized.deltaVsPrior,
            as_of: normalized.asOf,
          },
          { onConflict: 'topic,source,as_of' }
        )

        results.push({ topic: topic.topic, source, status: 'ok' })
      } catch (err: any) {
        console.error(`Trend fetch failed [${topic.topic} / ${source}]:`, err.message)
        results.push({ topic: topic.topic, source, status: 'error', error: err.message })
        // Continue to the next source/topic rather than failing the
        // whole run over one source being down or rate-limited.
      }
    }

    const composite = computeComposite(signalsForTopic)
    if (composite) {
      await supabaseAdmin.from('trend_composite').upsert(
        {
          topic: composite.topic,
          category: composite.category,
          composite_score: composite.compositeScore,
          delta_vs_prior: composite.deltaVsPrior,
          source_count: composite.sourceCount,
          as_of: composite.asOf,
        },
        { onConflict: 'topic,as_of' }
      )
    }
  }

  // Pruning runs last, after this run's composite scores are written, so
  // a topic's just-computed score counts toward its cold-streak check.
  // A pruning failure is logged but never fails the whole refresh — the
  // day's actual signal data is already safely written by this point.
  let pruning: { checked: number; retired: string[] } = { checked: 0, retired: [] }
  try {
    pruning = await pruneStaleTopics()
  } catch (err: any) {
    console.error('Topic pruning failed:', err.message)
  }

  const errorCount = results.filter((r) => r.status === 'error').length
  return NextResponse.json({
    success: true,
    date: today,
    topicsProcessed: topics.length,
    sourceCallsOk: results.filter((r) => r.status === 'ok').length,
    sourceCallsFailed: errorCount,
    discovery,
    pruning,
    results,
  })
}
