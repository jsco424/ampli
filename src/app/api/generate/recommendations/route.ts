import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AnalysisOutput } from '@/lib/analysisTypes'
import { stripDashJoins } from '@/lib/textCleanup'
import { logTokenUsage } from '@/lib/tokenUsage'

// A single Claude call at max_tokens: 1500 is fast — 60s is generous
// headroom, matching generate/route.ts's value for consistency rather than
// because this route actually needs that long.
export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Service-role client, not anon — same reasoning as every other server
// route this session: there's no window.Clerk here to attach a session via
// the accessToken callback in src/lib/supabase.ts, so an anon client would
// have zero auth token and RLS would silently block both the read and the
// write below.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TONE_INSTRUCTIONS: Record<string, string> = {
  executive:
    'Tone: Executive & Concise. Be punchy and direct. Lead with the single most important number in each section. Minimal context or setup — get straight to business impact. Short sentences. No fluff.',
  analytical:
    'Tone: Analytical & Detailed. Be methodical. Explain the "why" behind each insight, not just the "what". Reference the underlying data patterns. Write for a technical or skeptical audience that wants rigor.',
  educational:
    'Tone: Educational & Informative. Write like a neutral news brief reporting findings. No persuasive framing, no sales language, no urgency. Simply inform the reader of what the data shows.',
}

export async function POST(req: Request) {
  const { projectId }: { projectId: string } = await req.json()

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  // Fetch the project fresh, rather than trusting anything the client sends
  // — this route only needs an id, everything else (narrative, insights,
  // tone, target company, confirmed analysis) comes from what's already
  // saved on the row.
  const { data: project, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (fetchError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Recommendations reference the narrative/insights that Build Visuals
  // produces — without them there's nothing grounded to recommend against.
  // This is the dependency that makes "Build Visuals" a prerequisite step
  // before "Build Recommendations" in the UI, not just a suggested order.
  if (!project.narrative) {
    return NextResponse.json(
      {
        error: 'Build Visuals first — recommendations need the narrative and insights it produces.',
      },
      { status: 400 }
    )
  }

  const tone = project.tone || 'executive'
  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.executive

  // Recommendations previously had NO audience tailoring at all — not a
  // regression from today's refactor, this gap existed in the original
  // background call too. Adding it now since James flagged this as
  // probably the most important piece to get right for recommendations
  // specifically: the audience is who's actually going to read and act on
  // these, so which 3 recommendations get surfaced (and how they're
  // framed) should reflect what that person cares about, same tailoring
  // analyze/route.ts already applies to findings.
  const targetAudience: {
    role?: string
    seniority?: string
    cares_about?: string[]
    narrative_style?: string
    avoid?: string
  } | null = project.target_audience || null
  let audienceInstruction = ''
  if (targetAudience) {
    audienceInstruction = `
AUDIENCE TAILORING:
These recommendations are being built for: ${targetAudience.role || 'a business stakeholder'}${targetAudience.seniority ? ` (${targetAudience.seniority})` : ''}.
${targetAudience.cares_about?.length ? `They care about: ${targetAudience.cares_about.join(', ')}. Prioritize which 3 recommendations you surface, and how you frame each one, around these specifically over ones that don't speak to them.` : ''}
${targetAudience.narrative_style ? `Match this narrative style throughout: ${targetAudience.narrative_style}.` : ''}
${targetAudience.avoid ? `Avoid: ${targetAudience.avoid}.` : ''}
This shapes which actions you recommend and how you frame them — it never changes what the data actually supports, only which true, grounded recommendations you choose to lead with.`
  }

  // Same framing rule as generate/route.ts and analyze/route.ts — kept
  // identical wording across all three so the model gets a consistent
  // instruction regardless of which stage is generating text.
  let dataFramingInstruction = ''
  if (project.data_source_type === 'prospecting_benchmark' && project.target_company) {
    dataFramingInstruction = `
CRITICAL — data attribution: this dataset does NOT belong to ${project.target_company}. It is being used to build a case for why ${project.target_company} should become a client, not to report on their own performance. Never phrase a recommendation as though these specific numbers are ${project.target_company}'s own historical results. Instead, frame recommendations around what this trajectory demonstrates is POSSIBLE or ACHIEVABLE for a company like ${project.target_company}.`
  }

  const dataGroundingInstruction = `
CRITICAL — data grounding: the data summary provided was computed deterministically in code from the complete dataset — it is verified, not estimated. Every recommendation stat you produce MUST trace directly back to a number present in that summary or the confirmed analysis below. NEVER invent, estimate, or extrapolate a number that isn't directly there.`

  const confirmedAnalysis: AnalysisOutput | null = project.analysis || null
  let confirmedAnalysisInstruction = ''
  if (confirmedAnalysis) {
    const findingsSummary = confirmedAnalysis.keyFindings
      .map((f) => `• ${f.label}: ${f.value} — ${f.interpretation}`)
      .join('\n')
    confirmedAnalysisInstruction = `
CONFIRMED ANALYSIS — USER VERIFIED:
The following findings were confirmed by the user through a conversational analysis session. Recommendations MUST be grounded in these, not conclusions absent from them.

Executive Summary:
${confirmedAnalysis.executiveSummary}

Key Findings:
${findingsSummary}`
  }

  const recoPrompt = `You are a strategic analyst. Based on the data analysis, return ONLY a valid JSON array of exactly 3 recommendations:
[
  {
    "number": "01",
    "title": "Action headline (4-6 words)",
    "description": "2-3 sentences explaining why this matters and what to do",
    "stat": "57%",
    "stat_label": "short label"
  }
]
The "stat" must be grounded in the data summary — never invent a precise figure that isn't traceable to it.
Writing style — hard rule: NEVER join two clauses with an em-dash, en-dash, or a spaced hyphen. Use a period, comma, or connecting word instead. Word-internal hyphens (e.g. "high-revenue") are fine. Write like a sharp human analyst.
Return ONLY the JSON array, no markdown.`

  try {
    const recoMessage = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `${recoPrompt}\n\n${toneInstruction}\n\n${audienceInstruction}\n\n${dataFramingInstruction}\n\n${dataGroundingInstruction}${confirmedAnalysisInstruction ? `\n\n${confirmedAnalysisInstruction}` : ''}`,
      messages: [
        {
          role: 'user',
          content: `Project: ${project.name || project.pitch_title || 'Untitled'}\n\nNarrative:\n${(project.narrative || '').slice(0, 400)}\n\nInsights:\n${JSON.stringify(project.insights || [])}\n\nData summary (for grounding any stat you cite):\n${project.raw_data || 'No summary available.'}\n\n${project.prompt ? `Focus: ${project.prompt}` : ''}`,
        },
      ],
    })

    logTokenUsage({
      projectId,
      route: 'generate_recommendations',
      inputTokens: recoMessage.usage.input_tokens,
      outputTokens: recoMessage.usage.output_tokens,
    }).catch((err) => console.error('Failed to log token usage (non-fatal):', err))

    const recoRaw = recoMessage.content[0].type === 'text' ? recoMessage.content[0].text : ''
    const recoCleaned = recoRaw.replace(/```json|```/g, '').trim()
    const recommendationsParsed = JSON.parse(recoCleaned)
    const recommendations = (recommendationsParsed || []).map((rec: any) => ({
      ...rec,
      title: stripDashJoins(rec.title),
      description: stripDashJoins(rec.description),
    }))

    await supabase
      .from('projects')
      .update({ recommendations, recommendations_error: null })
      .eq('id', projectId)

    return NextResponse.json({ success: true, recommendations })
  } catch (err: any) {
    const errorMessage = err?.message || String(err)
    console.error('RECOMMENDATIONS ERROR:', errorMessage)
    try {
      await supabase
        .from('projects')
        .update({ recommendations_error: errorMessage })
        .eq('id', projectId)
    } catch (updateErr) {
      console.error('Also failed to persist recommendations_error:', updateErr)
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
