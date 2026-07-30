import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Phase 1 only — company/industry/date filters, counts and lists. Never
// AI-generated SQL, never AI doing the arithmetic: the model's only job is
// figuring out which of these two intents applies and pulling out the
// filter values. The actual query is always this fixed, hand-written
// Supabase call below. Phase 2 (real metric math like "total revenue")
// needs a metrics-extraction table that doesn't exist yet.
const EXAMPLE_QUERIES = [
  'How many decks have I built for a specific company?',
  'Show me all my projects in a specific industry',
  'What projects did I create this month?',
]

interface Classification {
  matched: boolean
  intent: 'count' | 'list' | null
  company: string | null
  industry: string | null
  dateFrom: string | null // YYYY-MM-DD
  dateTo: string | null
  suggestion: string | null
}

async function classifyQuery(query: string): Promise<Classification> {
  const today = new Date().toISOString().slice(0, 10)
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: `You classify a search question about someone's own analytics projects into a fixed set of supported query shapes. Today's date is ${today}.

Supported shapes only:
- intent "count": how many projects/decks match some filter
- intent "list": show/list projects matching some filter

Filters, all optional, combine with AND: company (a target company name mentioned), industry (an industry name mentioned), dateFrom/dateTo (YYYY-MM-DD, only if a specific time range like "this month", "in 2026", "last quarter" is mentioned).

If the question asks for something outside count/list of projects by company/industry/date (for example, asking about a specific metric value like revenue or ROAS, or anything not about projects at all), set matched to false and suggestion to a short, honest one sentence description of the closest thing that IS supported, phrased as something the person could ask instead.

Return ONLY valid JSON, no other text:
{"matched": true, "intent": "count", "company": "Acme Corp", "industry": null, "dateFrom": null, "dateTo": null, "suggestion": null}`,
    messages: [{ role: 'user', content: query }],
  })

  const raw = res.content[0].type === 'text' ? res.content[0].text : ''
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return {
      matched: false,
      intent: null,
      company: null,
      industry: null,
      dateFrom: null,
      dateTo: null,
      suggestion: 'Try asking about a specific company, industry, or time range.',
    }
  }
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { query } = await req.json()
  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }

  let classification: Classification
  try {
    classification = await classifyQuery(query)
  } catch (err) {
    console.error('Search classification failed:', err)
    return NextResponse.json(
      {
        matched: false,
        suggestion: 'Search is temporarily unavailable — try again shortly.',
        suggestions: [],
      },
      { status: 200 }
    )
  }

  // Logged with project_id: null — this is what keeps a search's tiny
  // classification cost structurally excluded from getCreditsUsedForUsers()
  // (which only sums usage that joins through a project the user owns),
  // while still giving a real, queryable cost ledger for internal
  // visibility. Never counted toward the user's plan limit, by design.
  try {
    await supabaseAdmin.from('token_usage_log').insert({
      project_id: null,
      user_id: userId,
      route: 'dashboard_search',
      cost_usd: 0.001, // rough estimate for a ~400 token classification call
    })
  } catch (err) {
    console.error('Search cost logging failed (non-fatal):', err)
  }

  if (!classification.matched) {
    return NextResponse.json({
      matched: false,
      suggestion: classification.suggestion || "That's not something I can search yet.",
      suggestions: EXAMPLE_QUERIES,
    })
  }

  let dbQuery = supabaseAdmin
    .from('projects')
    .select('id, name, file_name, target_company, industry, created_at', {
      count: classification.intent === 'count' ? 'exact' : undefined,
    })
    .eq('user_id', userId)

  if (classification.company) {
    dbQuery = dbQuery.ilike('target_company', `%${classification.company}%`)
  }
  if (classification.industry) {
    dbQuery = dbQuery.ilike('industry', `%${classification.industry}%`)
  }
  if (classification.dateFrom) {
    dbQuery = dbQuery.gte('created_at', classification.dateFrom)
  }
  if (classification.dateTo) {
    dbQuery = dbQuery.lte('created_at', classification.dateTo)
  }

  dbQuery = dbQuery.order('created_at', { ascending: false })
  if (classification.intent === 'list') dbQuery = dbQuery.limit(20)

  const { data, count, error } = await dbQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    matched: true,
    intent: classification.intent,
    count: classification.intent === 'count' ? (count ?? (data || []).length) : null,
    projects: classification.intent === 'list' ? data || [] : [],
    filters: {
      company: classification.company,
      industry: classification.industry,
      dateFrom: classification.dateFrom,
      dateTo: classification.dateTo,
    },
  })
}
