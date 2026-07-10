import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AnalysisOutput } from '@/lib/analysisTypes'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  const {
    projectId,
    dataSummary,
    rawSample,
    prompt,
    tone,
    projectName,
    targetCompany,
    targetAudience,
    optIn,
    dataSourceType,
    // NEW — optional. When present (new analysis-first flow), the user has
    // already verified these findings in conversation. Charts and narrative
    // must reflect them exactly. When absent (legacy path), behavior is
    // identical to before — full backward compatibility preserved.
    confirmedAnalysis,
  }: {
    projectId: string
    dataSummary?: string
    rawSample?: string
    prompt?: string
    tone?: string
    projectName?: string
    targetCompany?: string
    targetAudience?: any
    optIn?: boolean
    dataSourceType?: string
    confirmedAnalysis?: AnalysisOutput
  } = await req.json()

  const TONE_INSTRUCTIONS: Record<string, string> = {
    executive:
      'Tone: Executive & Concise. Be punchy and direct. Lead with the single most important number in each section. Minimal context or setup — get straight to business impact. Short sentences. No fluff.',
    analytical:
      'Tone: Analytical & Detailed. Be methodical. Explain the "why" behind each insight, not just the "what". Reference the underlying data patterns. Write for a technical or skeptical audience that wants rigor.',
    educational:
      'Tone: Educational & Informative. Write like a neutral news brief reporting findings. No persuasive framing, no sales language, no urgency. Simply inform the reader of what the data shows.',
  }
  const toneInstruction = TONE_INSTRUCTIONS[tone || 'executive'] || TONE_INSTRUCTIONS.executive

  let competitorInstruction = ''
  if (targetCompany) {
    const { data: research } = await supabase
      .from('company_research')
      .select('competitors')
      .eq('company_name', targetCompany)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const competitors = research?.competitors || []
    if (competitors.length > 0) {
      const names = competitors
        .slice(0, 4)
        .map((c: any) => c.name)
        .join(', ')
      competitorInstruction = `
Competitive context: The target company's known competitors include: ${names}.
If it strengthens ONE chart, add a competitor_overlay to that chart with a clearly-labeled ESTIMATED benchmark figure for ONE of these competitors (pick the most relevant one given the data). Never claim this is verified data — it should read as a directional estimate. Also weave a brief competitive comparison into the narrative if a competitor_overlay is used. Do not force this if it doesn't fit naturally — it's optional, not required.`
    }
  }

  let dataFramingInstruction = ''
  if (dataSourceType === 'prospecting_benchmark' && targetCompany) {
    dataFramingInstruction = `
CRITICAL — data attribution: this dataset does NOT belong to ${targetCompany}. It is being used to build a case for why ${targetCompany} should become a client, not to report on their own performance. Never phrase any narrative, insight, chart takeaway, hero_stat, or recommendation as though these specific numbers are ${targetCompany}'s own historical results. Instead, frame the story around what this trajectory demonstrates is POSSIBLE or ACHIEVABLE for a company like ${targetCompany}.`
  }

  const dataGroundingInstruction = `
CRITICAL — data grounding: the data summary provided was computed deterministically in code from the complete dataset — it is verified, not estimated. Every chart data point, insight value, hero_stat, and recommendation stat you produce MUST trace directly back to a number present in that summary. NEVER invent, estimate, or extrapolate a number that isn't directly there. If the summary doesn't support a chart, choose one it does support — never fabricate data points. The raw sample is for qualitative color only.`

  // ── Confirmed analysis injection ──────────────────────────────────────────
  // When the user has already verified findings through the conversational
  // analysis layer, those findings are the ground truth for slide content.
  // Charts visualize what was confirmed. Narrative reflects what was discussed.
  // The model must not contradict, reframe, or introduce new conclusions.
  let confirmedAnalysisInstruction = ''
  if (confirmedAnalysis) {
    const findingsSummary = confirmedAnalysis.keyFindings
      .map((f) => `• ${f.label}: ${f.value} — ${f.interpretation}`)
      .join('\n')

    const tablesSummary = confirmedAnalysis.insightTables
      .map((t) => `Table: "${t.title}" — ${t.description}`)
      .join('\n')

    const anomaliesSummary =
      confirmedAnalysis.anomalies.length > 0
        ? confirmedAnalysis.anomalies.map((a) => `• [${a.severity}] ${a.description}`).join('\n')
        : 'None flagged.'

    confirmedAnalysisInstruction = `
CONFIRMED ANALYSIS — USER VERIFIED:
The following findings were confirmed by the user through a conversational analysis session. Your slides and narrative MUST reflect these exactly. Do not contradict, reframe, or introduce conclusions not present here. You may choose how to visualize them, but the underlying facts are fixed.

Executive Summary:
${confirmedAnalysis.executiveSummary}

Key Findings (use these as the basis for insights and hero_stats):
${findingsSummary}

Computed Tables (use these as the basis for chart data where applicable):
${tablesSummary}

Flagged Anomalies (acknowledge these in narrative where relevant — do not hide them):
${anomaliesSummary}`
  }

  let chartVarietyHint = ''
  try {
    const parsedSummary = dataSummary ? JSON.parse(dataSummary) : null
    if (parsedSummary?.scatterPairs?.length > 0) {
      const strongest = [...parsedSummary.scatterPairs].sort(
        (a: any, b: any) => Math.abs(b.correlation ?? 0) - Math.abs(a.correlation ?? 0)
      )[0]
      if (strongest && Math.abs(strongest.correlation ?? 0) >= 0.3) {
        chartVarietyHint += `
Notable relationship found: ${strongest.xMetric} vs ${strongest.yMetric} has a correlation of ${strongest.correlation}. Strongly consider a "scatter" chart for this instead of defaulting to bar/line.`
      }
    }
    const wideDim = Object.entries(parsedSummary?.dimensions || {}).find(
      ([, d]: any) => (d?.top?.length ?? 0) >= 6
    )
    if (wideDim) {
      const [dimName, dimData] = wideDim as [string, any]
      chartVarietyHint += `
The "${dimName}" breakdown has ${(dimData as any).top.length} categories — use "treemap" instead of pie/bar for this one.`
    }
  } catch {
    /* skip hint if dataSummary isn't valid JSON */
  }

  const corePrompt = `You are a data analyst and storyteller. Analyze the data summary and return ONLY a valid JSON object:

{
  "pitch_title": "Short punchy title (4-6 words). Never mention target company or audience.",
  "narrative": "3-4 paragraph business story. Plain text only. Keep concise.",
  "insights": [
    { "title": "Metric Name", "value": "123K", "description": "One sentence", "trend": "up" }
  ],
  "charts": [
    {
      "type": "bar",
      "title": "Chart Title",
      "description": "One sentence",
      "data": [{ "name": "Label", "value": 100 }],
      "hero_stat": "48%",
      "takeaway": "One punchy business sentence",
      "layout": "split-right",
      "stacked": false,
      "annotations": [{ "x": "Mar", "label": "Launch spike" }],
      "reference_line": { "label": "Industry Avg", "value": 2400 },
      "competitor_overlay": { "name": "CompetitorName", "value": 1800 }
    }
  ]
}

Rules:
- insights: up to 5 items. trend must be "up", "down", or "neutral". Never invent an insight to hit a count.
- charts: up to 6 items. type must be one of: bar, line, area, pie. Never fewer than 2 if the data supports them.
- chart data: max 6 data points per chart, every point must come from the data summary.
- single series: use "value" key. Two series: use two numeric keys e.g. { "name": "Jan", "new": 700, "returning": 1600 }
- layout: "split-right" | "split-left" | "full-bleed" | "top-bottom"
- annotations: OPTIONAL, max 1-2 per chart. "x" must exactly match a "name" value in that chart's data array. Omit entirely if nothing noteworthy.
- reference_line: OPTIONAL, max 1 per chart. Value must be in the same unit/scale as chart data. Omit if not relevant.
- competitor_overlay: OPTIONAL, max 1 chart total across the whole deck. Omit entirely if not relevant.
- narrative: max 3 paragraphs, keep tight.
- Writing style: avoid chaining clauses with em-dashes or hyphens. Vary sentence length like a sharp human analyst.
- Return ONLY the JSON object, no markdown, no explanation.

${toneInstruction}
${confirmedAnalysisInstruction}
${competitorInstruction}
${dataFramingInstruction}
${dataGroundingInstruction}
${chartVarietyHint}
${prompt ? `User focus: ${prompt}` : ''}
${targetCompany ? `Target company: ${targetCompany}` : ''}
${targetAudience ? `Target audience: ${targetAudience.role} (${targetAudience.seniority}). They care about: ${targetAudience.cares_about?.join(', ')}. Style: ${targetAudience.narrative_style}. Avoid: ${targetAudience.avoid}` : ''}`

  try {
    const coreMessage = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: corePrompt,
      messages: [
        {
          role: 'user',
          content: `Project: ${projectName || 'Untitled'}

Data summary (verified, computed from the full dataset — your only source of factual numbers):
${dataSummary || 'No summary available — produce fewer, more conservative charts/insights.'}

Raw sample (qualitative color only — column names, notable categories, tone — never a source of specific numbers):
${rawSample || ''}`,
        },
      ],
    })

    const coreRaw = coreMessage.content[0].type === 'text' ? coreMessage.content[0].text : ''
    const coreCleaned = coreRaw.replace(/```json|```/g, '').trim()
    const coreParsed = JSON.parse(coreCleaned)

    const coreResult = {
      pitch_title: coreParsed.pitch_title || projectName || 'Untitled',
      narrative:
        typeof coreParsed.narrative === 'string'
          ? coreParsed.narrative
          : JSON.stringify(coreParsed.narrative),
      insights: coreParsed.insights || [],
      charts: coreParsed.charts || [],
    }

    await supabase
      .from('projects')
      .update({
        pitch_title: coreResult.pitch_title,
        narrative: coreResult.narrative,
        insights: coreResult.insights,
        charts: coreResult.charts,
        tone: tone || 'executive',
        status: 'completed',
      })
      .eq('id', projectId)

    if (optIn) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/crowd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          rawData: dataSummary,
          insights: coreResult.insights,
          narrative: coreResult.narrative,
        }),
      }).catch(console.error)
    }

    // Recommendations — background, fire and forget
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
Writing style: avoid chaining clauses with em-dashes or hyphens. Write like a sharp human analyst.
Return ONLY the JSON array, no markdown.`

    client.messages
      .create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: `${recoPrompt}\n\n${toneInstruction}\n\n${dataFramingInstruction}\n\n${dataGroundingInstruction}${confirmedAnalysis ? `\n\n${confirmedAnalysisInstruction}` : ''}`,
        messages: [
          {
            role: 'user',
            content: `Project: ${projectName}\n\nNarrative:\n${coreResult.narrative.slice(0, 400)}\n\nInsights:\n${JSON.stringify(coreResult.insights)}\n\nData summary (for grounding any stat you cite):\n${dataSummary || 'No summary available.'}\n\n${prompt ? `Focus: ${prompt}` : ''}`,
          },
        ],
      })
      .then(async (recoMessage) => {
        const recoRaw = recoMessage.content[0].type === 'text' ? recoMessage.content[0].text : ''
        const recoCleaned = recoRaw.replace(/```json|```/g, '').trim()
        try {
          const recommendations = JSON.parse(recoCleaned)
          await supabase.from('projects').update({ recommendations }).eq('id', projectId)
        } catch {
          console.error('Failed to parse recommendations')
        }
      })
      .catch(console.error)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('GENERATE ERROR:', err?.message || err)
    await supabase.from('projects').update({ status: 'failed' }).eq('id', projectId)
    return NextResponse.json({ error: err?.message || 'Generation failed' }, { status: 500 })
  }
}
