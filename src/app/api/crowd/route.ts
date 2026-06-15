import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  const { projectId, rawData, insights, narrative } = await req.json()

  // Step 1 — detect industry and extract anonymous metrics
  const extractRes = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You are a data analyst. Given raw data and insights from an anonymous upload, return ONLY a valid JSON object:
{
  "industry": "one of: Retail, Healthcare, Technology, Finance, Marketing, Education, Manufacturing, Hospitality, Real Estate, Media, Energy, Nonprofit, Logistics, Other",
  "metrics": {
    "avg_revenue_growth": number or null,
    "avg_conversion_rate": number or null,
    "avg_customer_growth": number or null,
    "top_trend": "one sentence anonymous trend observed",
    "key_insight": "one sentence anonymous insight, no brand names or company identifiers"
  }
}
Remove ALL brand names, company names, product names, and any identifying information.
Return ONLY valid JSON.`,
    messages: [{
      role: 'user',
      content: `Raw data sample:\n${rawData}\n\nInsights:\n${JSON.stringify(insights)}\n\nNarrative summary:\n${narrative?.slice(0, 500)}`
    }]
  })

  const raw = extractRes.content[0].type === 'text' ? extractRes.content[0].text : ''
  const cleaned = raw.replace(/```json|```/g, '').trim()

  let extracted: any
  try {
    extracted = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'Failed to extract metrics' }, { status: 500 })
  }

  const { industry, metrics } = extracted

  // Step 2 — upsert into crowd_insights, merging with existing aggregate
  const { data: existing } = await supabase
    .from('crowd_insights')
    .select('*')
    .eq('industry', industry)
    .single()

  if (existing) {
    // Merge metrics as running averages
    const count = existing.contribution_count
    const prev = existing.metrics

    const merged = {
      avg_revenue_growth: avg(prev.avg_revenue_growth, metrics.avg_revenue_growth, count),
      avg_conversion_rate: avg(prev.avg_conversion_rate, metrics.avg_conversion_rate, count),
      avg_customer_growth: avg(prev.avg_customer_growth, metrics.avg_customer_growth, count),
      top_trends: mergeTrends(prev.top_trends || [], metrics.top_trend),
      key_insights: mergeInsights(prev.key_insights || [], metrics.key_insight),
    }

    await supabase.from('crowd_insights').update({
      metrics: merged,
      contribution_count: count + 1,
      last_updated: new Date().toISOString(),
    }).eq('industry', industry)
  } else {
    // First contribution for this industry
    await supabase.from('crowd_insights').insert({
      industry,
      metrics: {
        avg_revenue_growth: metrics.avg_revenue_growth,
        avg_conversion_rate: metrics.avg_conversion_rate,
        avg_customer_growth: metrics.avg_customer_growth,
        top_trends: metrics.top_trend ? [metrics.top_trend] : [],
        key_insights: metrics.key_insight ? [metrics.key_insight] : [],
      },
      contribution_count: 1,
    })
  }

  // Step 3 — update project with detected industry
  await supabase.from('projects').update({ industry }).eq('id', projectId)

  return NextResponse.json({ success: true, industry })
}

// Running average helper — ignores nulls
function avg(prev: number | null, next: number | null, prevCount: number): number | null {
  if (prev === null && next === null) return null
  if (prev === null) return next
  if (next === null) return prev
  return Math.round(((prev * prevCount) + next) / (prevCount + 1) * 100) / 100
}

// Keep last 10 unique trends
function mergeTrends(existing: string[], newTrend: string | null): string[] {
  if (!newTrend) return existing
  const merged = [newTrend, ...existing.filter(t => t !== newTrend)]
  return merged.slice(0, 10)
}

// Keep last 10 unique insights
function mergeInsights(existing: string[], newInsight: string | null): string[] {
  if (!newInsight) return existing
  const merged = [newInsight, ...existing.filter(i => i !== newInsight)]
  return merged.slice(0, 10)
}