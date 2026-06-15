import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  const { projectId, data, prompt, projectName, targetCompany, targetAudience, optIn } =
    await req.json()

  // ── CALL 1 — Core content (fast path) ──────────────────────────────────────
  const corePrompt = `You are a data analyst and storyteller. Analyze the raw data and return ONLY a valid JSON object:

{
  "pitch_title": "Short punchy title (4-6 words). Never mention target company or audience.",
  "narrative": "3-4 paragraph business story. Plain text only.",
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
      "layout": "split-right"
    }
  ]
}

Rules:
- insights: 4-6 items, trend must be "up", "down", or "neutral"
- charts: 4-6 items, type must be one of: bar, line, area, pie
- chart data must have "name" and "value" keys only, value must be a NUMBER
- chart data: if comparing TWO series (e.g. new vs returning, before vs after), use TWO numeric keys per object: [{ "name": "Jan", "new_customers": 700, "returning_customers": 1600 }]. If single series use "value" key: [{ "name": "Jan", "value": 100 }]
- layout options: "split-right" (bar comparisons), "split-left" (line/trends), "full-bleed" (dramatic single metric), "top-bottom" (pie/distributions), "stat-focus" (multi-metric)
- Return ONLY the JSON object, no markdown

${prompt ? `User focus: ${prompt}` : ''}
${targetCompany ? `Target company: ${targetCompany}` : ''}
${targetAudience ? `Target audience: ${targetAudience.role} (${targetAudience.seniority}). They care about: ${targetAudience.cares_about?.join(', ')}. Style: ${targetAudience.narrative_style}. Avoid: ${targetAudience.avoid}` : ''}`

  try {
    const coreMessage = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: corePrompt,
      messages: [{ role: 'user', content: `Project: ${projectName}\n\nData:\n${data}` }],
    })

    const coreRaw = coreMessage.content[0].type === 'text' ? coreMessage.content[0].text : ''
    const coreCleaned = coreRaw.replace(/```json|```/g, '').trim()
    const coreParsed = JSON.parse(coreCleaned)

    const coreResult = {
      pitch_title: coreParsed.pitch_title || projectName,
      narrative:
        typeof coreParsed.narrative === 'string'
          ? coreParsed.narrative
          : JSON.stringify(coreParsed.narrative),
      insights: coreParsed.insights || [],
      charts: coreParsed.charts || [],
    }

    // Save core content immediately — project becomes "completed" here
    await supabase
      .from('projects')
      .update({
        pitch_title: coreResult.pitch_title,
        narrative: coreResult.narrative,
        insights: coreResult.insights,
        charts: coreResult.charts,
        status: 'completed',
      })
      .eq('id', projectId)

    // Trigger crowd aggregation if opted in
    if (optIn) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/crowd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          rawData: data,
          insights: coreResult.insights,
          narrative: coreResult.narrative,
        }),
      }).catch(console.error)
    }

    // ── CALL 2 — Recommendations (background, non-blocking) ──────────────────
    const recoPrompt = `You are a strategic analyst. Based on the data analysis below, return ONLY a valid JSON array of exactly 4 recommendations:

[
  {
    "number": "01",
    "title": "Action-oriented headline (4-6 words)",
    "description": "2-3 sentences explaining why this matters and what to do specifically",
    "stat": "57%",
    "stat_label": "short label explaining the stat"
  }
]

Make recommendations specific, actionable, and backed by the data.
Return ONLY the JSON array, no markdown, no explanation.`

    // Fire and forget — don't await, let it run in background
    client.messages
      .create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: recoPrompt,
        messages: [
          {
            role: 'user',
            content: `Project: ${projectName}\n\nNarrative summary:\n${coreResult.narrative.slice(0, 500)}\n\nKey insights:\n${JSON.stringify(coreResult.insights)}\n\n${prompt ? `Focus: ${prompt}` : ''}`,
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
  } catch (err) {
    await supabase.from('projects').update({ status: 'failed' }).eq('id', projectId)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
