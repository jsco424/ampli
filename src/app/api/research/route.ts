import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const { url } = await req.json()

  const systemPrompt = `You are a business intelligence analyst. Given a company website URL, return ONLY a valid JSON object with this exact structure:

{
  "company_name": "Full Company Name",
  "description": "2-3 sentence description of what the company does",
  "products": [
    { "name": "Product Name", "description": "One sentence description" }
  ],
  "competitors": [
    { "name": "Competitor Name", "description": "One sentence description" }
  ],
  "audiences": [
    {
      "role": "Chief Marketing Officer",
      "seniority": "C-Suite",
      "tier": "executive",
      "cares_about": ["Revenue impact", "Market share", "Board-level metrics"],
      "narrative_style": "Big picture, lead with business outcomes, minimal jargon, connect to revenue",
      "avoid": "Technical details, granular metrics, methodology"
    }
  ]
}

Rules:
- products: 6-10 items
- competitors: 4-6 items  
- audiences: 5-7 personas spanning from C-Suite to individual contributors
- tier must be one of: "executive", "director", "manager", "individual"
- cares_about: 3-4 specific priorities for that role
- narrative_style: how to frame insights for this person
- avoid: what NOT to emphasize for this person
- Return ONLY valid JSON, no markdown, no explanation`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Research this company: ${url}` }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = raw.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
  }
}