import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { data, prompt, projectName, targetCompany, targetAudience, optIn, projectId, rawData, insights: existingInsights, narrative: existingNarrative } = await req.json()

  const systemPrompt = `You are a data analyst and storyteller. Analyze the raw data and return ONLY a valid JSON object with exactly these three fields:

{
  "narrative": "A compelling 3-4 paragraph business story about the data. Plain text only, no JSON, no markdown.",
  "insights": [
    { "title": "Metric Name", "value": "123K", "description": "One sentence explanation", "trend": "up" }
  ],
  "charts": [
    { "type": "bar", "title": "Chart Title", "description": "One sentence", "data": [{ "name": "Label", "value": 100 }] }
  ]
}

Rules:
- narrative must be plain prose text, NOT JSON or markdown
- insights: 4-6 items, trend must be "up", "down", or "neutral"
- charts: 4-6 items, type must be one of: bar, line, area, pie
- chart data must have "name" and "value" keys only
- value in chart data must be a NUMBER not a string
- Return ONLY the JSON object, no explanation, no markdown fences

${prompt ? `User focus: ${prompt}` : ''}
${targetCompany ? `Target company for this pitch: ${targetCompany}` : ''}
${targetAudience ? `Target audience: ${targetAudience.role} (${targetAudience.seniority}). They care about: ${targetAudience.cares_about?.join(', ')}. Narrative style: ${targetAudience.narrative_style}. Avoid: ${targetAudience.avoid}` : ''}`

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
    return NextResponse.json({ narrative: cleaned, insights: [], charts: [] })
  }

  const result = {
    narrative: typeof parsed.narrative === 'string' ? parsed.narrative : JSON.stringify(parsed.narrative),
    insights: parsed.insights || [],
    charts: parsed.charts || [],
  }

  // Trigger crowd aggregation in background if opted in
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
    }).catch(console.error) // fire and forget
  }

  return NextResponse.json(result)
}