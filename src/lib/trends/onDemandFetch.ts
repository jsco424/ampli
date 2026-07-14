import { createClient } from '@supabase/supabase-js'
import { fetchWikipediaToday } from './sources/wikipedia'
import { fetchYoutubeToday } from './sources/youtube'
import { normalizeSignal, type RawSignal, type NormalizedSignal } from './normalize'
import { computeComposite } from './aggregate'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TRAILING_DAYS = 14

export interface CompanyTrendResult {
  topic: string
  compositeScore: number | null
  deltaVsPrior: number | null
  // Short, honest sentence for the analysis prompt — explicitly framed as
  // supplementary confirming color, never a substitute for core findings.
  summarySentence: string
}

// Fetches (and persists) today's public-interest signal for one company
// name, on demand — synchronous, not gated behind the daily cron. Reuses
// the exact same source fetchers and normalization logic as the scheduled
// pipeline (see src/app/api/trends/refresh/route.ts), so a company tracked
// this way behaves identically to a curated topic on every refresh after
// today. Upserts into trend_topics with category='company' and active=true,
// so it's included in future daily runs automatically — per the decision
// to let the tracked-topic list grow organically rather than staying
// purely ephemeral per-deck.
//
// wikipedia_article is a best-effort transform (spaces -> underscores),
// not a curated exact match the way seedTopics.ts's entries are. A 404
// from Wikipedia is handled gracefully upstream (returns 0, not a throw),
// so an imperfect match just means a quiet zero rather than a failure.
export async function fetchCompanyTrendOnDemand(
  companyName: string,
  projectId: string | null
): Promise<CompanyTrendResult> {
  const today = new Date().toISOString().slice(0, 10)
  const trimmedName = companyName.trim()
  const wikipediaArticle = trimmedName.replace(/\s+/g, '_')

  await supabaseAdmin.from('trend_topics').upsert(
    {
      topic: trimmedName,
      category: 'company',
      wikipedia_article: wikipediaArticle,
      youtube_query: trimmedName,
      reddit_subreddits: null,
      reddit_query: null,
      active: true,
      added_via_project_id: projectId,
    },
    { onConflict: 'topic' }
  )

  const signals: NormalizedSignal[] = []

  for (const source of ['wikipedia', 'youtube'] as const) {
    try {
      const rawValue =
        source === 'wikipedia'
          ? await fetchWikipediaToday(wikipediaArticle)
          : await fetchYoutubeToday(trimmedName)

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - TRAILING_DAYS)
      const { data: history } = await supabaseAdmin
        .from('trend_signals')
        .select('raw_value, as_of')
        .eq('topic', trimmedName)
        .eq('source', source)
        .gte('as_of', cutoff.toISOString().slice(0, 10))
        .order('as_of', { ascending: true })

      const trailingValues = (history || []).map((h) => Number(h.raw_value))

      const raw: RawSignal = {
        topic: trimmedName,
        category: 'company',
        source,
        rawValue,
        asOf: today,
      }
      const normalized = normalizeSignal(raw, trailingValues)
      signals.push(normalized)

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
    } catch (err) {
      // A single source failing (rate limit, no real Wikipedia match, etc.)
      // shouldn't block the other source or the analysis call waiting on
      // this — same "continue past failures" pattern as the scheduled
      // pipeline in api/trends/refresh/route.ts.
      console.error(`On-demand trend fetch failed [${trimmedName} / ${source}]:`, err)
    }
  }

  const composite = computeComposite(signals)

  let summarySentence = `No public interest data available yet for ${trimmedName}.`
  if (composite) {
    const trendPhrase =
      composite.deltaVsPrior === null
        ? 'is being tracked for the first time'
        : composite.deltaVsPrior > 5
          ? `is up ${composite.deltaVsPrior}%`
          : composite.deltaVsPrior < -5
            ? `is down ${Math.abs(composite.deltaVsPrior)}%`
            : 'is holding steady'
    summarySentence = `Public interest in ${trimmedName} ${trendPhrase} vs. last week (interest score: ${composite.compositeScore}/100, relative to its own recent activity, not a comparison to other companies).`
  }

  return {
    topic: trimmedName,
    compositeScore: composite?.compositeScore ?? null,
    deltaVsPrior: composite?.deltaVsPrior ?? null,
    summarySentence,
  }
}
