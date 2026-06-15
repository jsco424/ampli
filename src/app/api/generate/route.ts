import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  const { projectId, data, prompt, projectName, targetCompany, targetAudience, optIn } = await req.json()

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

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Project: ${projectName}\n\nData:\n${data}` }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    const result = {
      narrative: typeof parsed.narrative === 'string' ? parsed.narrative : JSON.stringify(parsed.narrative),
      insights: parsed.insights || [],
      charts: parsed.charts || [],
    }

    // Update project to completed
    await supabase.from('projects').update({
      narrative: result.narrative,
      insights: result.insights,
      charts: result.charts,
      status: 'completed',
    }).eq('id', projectId)

    // Trigger crowd aggregation if opted in
    if (optIn) {
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

    return NextResponse.json({ success: true })
  } catch (err) {
    // Mark project as failed
    await supabase.from('projects').update({ status: 'failed' }).eq('id', projectId)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}