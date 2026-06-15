import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { companyName } = await req.json()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
    system: `You are a business intelligence analyst. Search for recent news about the given company and return ONLY a valid JSON array with this structure:
[
  {
    "headline": "Exact or close headline text",
    "publication": "Publication name e.g. Bloomberg, WSJ, TechCrunch",
    "date": "e.g. June 10, 2026",
    "summary": "One sentence on why this matters for a sales pitch",
    "sentiment": "positive" | "negative" | "neutral",
    "category": "acquisition" | "earnings" | "product" | "leadership" | "legal" | "partnership" | "ipo" | "general"
  }
]
Return 5-8 items. Return ONLY the JSON array, no markdown, no explanation.`,
    messages: [{
      role: 'user',
      content: `Find the most recent and relevant news stories about ${companyName} from major publications in the last 90 days.`
    }],
  })

  // Extract text from potentially multi-block response
  const text = message.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')

  const cleaned = text.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    return NextResponse.json({ news: parsed })
  } catch {
    return NextResponse.json({ news: [] })
  }
}