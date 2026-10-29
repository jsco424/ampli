import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@clerk/nextjs/server'
import { CANONICAL_FIELDS, FIELD_BY_KEY } from '@/lib/canonicalFields'
import { stripDashJoins } from '@/lib/textCleanup'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ColumnIn {
  name: string
  role?: string
  // Numeric sample values only. Text values are never sent.
  values?: number[]
  candidates?: string[]
}

const FIELD_LIST = CANONICAL_FIELDS.filter((c) => c.kind === 'measure' && !c.derived)
  .concat(CANONICAL_FIELDS.filter((c) => c.derived))
  .map((c) => `${c.key}: ${c.label}`)
  .join('\n')

const SYSTEM_PROMPT = `You help place spreadsheet columns into a fixed list of canonical marketing and business fields.

You are given column names, a few numeric sample values for each, and the names of the other columns in the same file. For each column decide which canonical field it is, or null when none fits.

Canonical fields (key: label):
${FIELD_LIST}

Rules:
- Use only keys from the list above. Never invent a key.
- Use the other column names as context. A column called "Cost" next to "Revenue" and "Clicks" is most likely Spend. A column called "Cash Flow" next to a Customer ID is likely revenue per customer, which is revenue.
- Values between 0 and 1 with decimals suggest a rate. Whole numbers suggest a count. Large values with two decimals suggest money.
- confidence is 0 to 1. Use 0.85 or higher only when the name and values clearly agree. Use below 0.6 when the column could reasonably be two or more fields.
- When unsure, set field to the best guess and list the plausible keys in candidates (two to four keys, best first). When no key fits at all, set field to null and candidates to an empty array.
- question: one short plain sentence asking the person what the column is, using the column's own name. Leave it empty when confidence is 0.85 or higher. Do not use dashes to join clauses.

Return ONLY valid JSON, no markdown, matching exactly:
{ "results": [ { "column": "string", "field": "string or null", "confidence": 0.0, "candidates": ["key"], "question": "string" } ] }`

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { columns?: ColumnIn[]; allColumns?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const columns = (body.columns || [])
    .slice(0, 12)
    .filter((c) => c && typeof c.name === 'string' && c.name.trim())
  if (columns.length === 0) return NextResponse.json({ results: [] })
  const allColumns = (body.allColumns || []).slice(0, 60).map((n) => String(n).slice(0, 80))

  const lines = columns.map((c) => {
    const vals = (c.values || [])
      .filter((v) => typeof v === 'number' && Number.isFinite(v))
      .slice(0, 5)
    return `- ${JSON.stringify(c.name.slice(0, 80))}${vals.length ? ` values: ${vals.join(', ')}` : ''}${c.candidates?.length ? ` (name suggests: ${c.candidates.join(', ')})` : ''}`
  })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Other columns in this file: ${allColumns.join(', ') || 'none'}\n\nColumns to place:\n${lines.join('\n')}`,
        },
      ],
    })

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      results: {
        column: string
        field: string | null
        confidence: number
        candidates?: string[]
        question?: string
      }[]
    }

    const known = new Set(columns.map((c) => c.name))
    const results = (parsed.results || [])
      .filter((r) => known.has(r.column))
      .map((r) => {
        const field = r.field && FIELD_BY_KEY[r.field] ? r.field : null
        const candidates = (r.candidates || []).filter((k) => FIELD_BY_KEY[k]).slice(0, 4)
        return {
          column: r.column,
          field,
          confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
          candidates: field && !candidates.includes(field) ? [field, ...candidates] : candidates,
          question: stripDashJoins(r.question || ''),
        }
      })

    return NextResponse.json({ results })
  } catch (err) {
    // Column matching is a convenience. A failure here must never block an
    // upload, so the caller falls back to asking the person directly.
    console.error('map-columns failed:', err)
    return NextResponse.json({ results: [], error: 'unavailable' })
  }
}
