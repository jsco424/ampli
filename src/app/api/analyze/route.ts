import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { data, prompt, projectName, targetCompany, targetAudience, optIn, projectId } =
    await req.json()

  const systemPrompt = `You are a data analyst and storyteller. Analyze the raw data and return ONLY a valid JSON object with exactly these fields:

{
  "pitch_title": "Short punchy presentation title (4-6 words max). Never mention target company or audience.",
  "narrative": "A compelling 3-4 paragraph business story. Plain text only.",
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
      "takeaway": "One punchy sentence explaining the hero stat in business terms",
      "layout": "split-right"
    }
  ],
  "recommendations": [
    {
      "number": "01",
      "title": "Recommendation headline (4-6 words)",
      "description": "2-3 sentences explaining why this matters and what to do",
      "stat": "57%",
      "stat_label": "short label explaining the stat"
    }
  ]
}

Rules:
- pitch_title: short, punchy, no audience/company references
- insights: 4-6 items, trend must be "up", "down", or "neutral"
- charts: 4-6 items, type must be one of: bar, line, area, pie
- chart data must have "name" and "value" keys only, value must be a NUMBER
- chart data: if comparing TWO series (e.g. new vs returning, before vs after), use TWO numeric keys per object: [{ "name": "Jan", "new_customers": 700, "returning_customers": 1600 }]. If single series use "value" key: [{ "name": "Jan", "value": 100 }]
- hero_stat: single most impactful number from this chart
- takeaway: one punchy business sentence
- layout: choose the BEST layout for this specific chart:
  "split-right" = chart left 65%, hero panel right 35% (best for bar charts showing comparison)
  "split-left" = hero panel left 35%, chart right 65% (best for line/trend charts)
  "full-bleed" = chart takes 80% width, hero stat overlaid as floating card (best for dramatic single metrics)
  "top-bottom" = chart top 60%, hero stat full width bottom (best for pie/distribution charts)
  "stat-focus" = 3 mini stats across top, chart below (best for multi-metric overview charts)
- recommendations: exactly 4 items, each with a specific actionable stat
- Return ONLY the JSON object, no explanation, no markdown fences

${prompt ? `User focus: ${prompt}` : ''}
${targetCompany ? `Target company: ${targetCompany}` : ''}
${targetAudience ? `Target audience: ${targetAudience.role} (${targetAudience.seniority}). They care about: ${targetAudience.cares_about?.join(', ')}. Style: ${targetAudience.narrative_style}. Avoid: ${targetAudience.avoid}` : ''}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Project: ${projectName}\n\nData:\n${data}` }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = raw.replace(/```json|```/g, '').trim()

  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({
      narrative: cleaned,
      insights: [],
      charts: [],
      pitch_title: projectName,
      recommendations: [],
    })
  }

  const result = {
    pitch_title: parsed.pitch_title || projectName,
    narrative:
      typeof parsed.narrative === 'string' ? parsed.narrative : JSON.stringify(parsed.narrative),
    insights: parsed.insights || [],
    charts: parsed.charts || [],
    recommendations: parsed.recommendations || [],
  }

  if (optIn && projectId) {
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/crowd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        rawData: data,
        insights: result.insights,
        narrative: result.narrative,
      }),
    }).catch(console.error)
  }

  return NextResponse.json(result)
}
