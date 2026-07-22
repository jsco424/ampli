// Auto-discovery of new trend topics from Google Trends' daily trending
// searches. This is what makes User Behaviors dynamic instead of a fixed
// 18-topic seed list — candidate terms are classified against the six
// trend categories using simple keyword-overlap matching, deliberately not
// an AI call, to keep this a free, unlimited-frequency step (same reasoning
// as the existing free Wikipedia/YouTube sources, and consistent with
// conserving Anthropic spend during pre-revenue testing).
//
// A term is added to trend_topics only if it clears the classification
// threshold against some category's keyword set. Anything that doesn't fit
// one of the six categories cleanly is left out — better to miss a
// borderline term than pollute a category with something unrelated.

import { createClient } from '@supabase/supabase-js'
import { fetchGoogleTrendsDaily } from './sources/googleTrends'
import type { TrendCategory } from './normalize'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Keyword sets per category — deliberately loose rather than an exhaustive
// taxonomy. Tune these based on what actually gets missed or wrongly
// matched once real trending terms start flowing through.
const CATEGORY_KEYWORDS: Record<Exclude<TrendCategory, 'company'>, string[]> = {
  auto: [
    'car',
    'truck',
    'suv',
    'vehicle',
    'ev',
    'electric vehicle',
    'tesla',
    'ford',
    'toyota',
    'honda',
    'chevrolet',
    'dealership',
    'auto',
  ],
  education: [
    'college',
    'university',
    'school',
    'student',
    'fafsa',
    'tuition',
    'scholarship',
    'degree',
    'sat',
    'act exam',
  ],
  home: ['home', 'house', 'mortgage', 'rent', 'apartment', 'real estate', 'renovation', 'housing'],
  finance: [
    'savings',
    'ira',
    'stock',
    'invest',
    'credit card',
    'bank',
    'tax',
    'mortgage rate',
    'interest rate',
    'crypto',
    'economy',
    'inflation',
  ],
  travel: [
    'flight',
    'airline',
    'hotel',
    'vacation',
    'travel',
    'trip',
    'airport',
    'cruise',
    'passport',
  ],
  tech: [
    'ai',
    'iphone',
    'app',
    'software',
    'chip',
    'startup',
    'tech',
    'computer',
    'smartphone',
    'google',
    'microsoft',
    'apple',
  ],
}

const CLASSIFICATION_THRESHOLD = 1 // at least one keyword hit

function classify(term: string): Exclude<TrendCategory, 'company'> | null {
  const lower = term.toLowerCase()
  let bestCategory: Exclude<TrendCategory, 'company'> | null = null
  let bestScore = 0
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestCategory = category as Exclude<TrendCategory, 'company'>
    }
  }
  return bestScore >= CLASSIFICATION_THRESHOLD ? bestCategory : null
}

export interface DiscoveryResult {
  scanned: number
  classified: number
  added: string[]
}

// Run once per daily refresh, before the normal per-topic signal fetch —
// so anything newly discovered today gets its first signal reading in the
// same run. Only inserts topics not already tracked; existing topics
// (seed or previously discovered) are left untouched here.
export async function discoverNewTopics(): Promise<DiscoveryResult> {
  const candidates = await fetchGoogleTrendsDaily()
  const added: string[] = []

  const { data: existing } = await supabaseAdmin.from('trend_topics').select('topic')
  const existingSet = new Set((existing || []).map((r: any) => r.topic.toLowerCase()))

  let classified = 0
  for (const candidate of candidates) {
    if (existingSet.has(candidate.term.toLowerCase())) continue
    const category = classify(candidate.term)
    if (!category) continue
    classified++

    const wikipediaArticle = candidate.term.trim().replace(/\s+/g, '_')
    await supabaseAdmin.from('trend_topics').upsert(
      {
        topic: candidate.term,
        category,
        wikipedia_article: wikipediaArticle,
        youtube_query: candidate.term,
        reddit_subreddits: null,
        reddit_query: null,
        active: true,
        topic_origin: 'discovered',
        discovered_at: new Date().toISOString(),
      },
      { onConflict: 'topic' }
    )
    added.push(candidate.term)
  }

  return { scanned: candidates.length, classified, added }
}
