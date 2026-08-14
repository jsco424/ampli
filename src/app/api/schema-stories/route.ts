import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@clerk/nextjs/server'
import { checkCreditLimit } from '@/lib/creditLimit'
import { logTokenUsage } from '@/lib/tokenUsage'
import { stripDashJoins } from '@/lib/textCleanup'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DIALECT_LABELS: Record<string, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlserver: 'SQL Server (T-SQL)',
  snowflake: 'Snowflake',
  bigquery: 'BigQuery (Standard SQL)',
}

interface ColumnInput {
  name: string
  type: string
  description: string
}

interface TableInput {
  name: string
  notes: string
  columns: ColumnInput[]
}

const SYSTEM_PROMPT = `You are a senior data analyst who writes clean, correct, production-ready SQL. Given a description of someone's own database schema (table names, columns, types, and notes on what things mean), propose several genuinely different story angles their data could reveal, each backed by real, runnable SQL written in the exact SQL dialect specified.

Rules:
- Every story must be something the GIVEN schema can actually answer. Never reference a table or column that wasn't provided. Never invent a relationship between tables that wasn't stated or isn't a reasonably obvious foreign key match (e.g. a column literally named customer_id in two tables).
- Propose up to 6 stories, fewer if the schema is small or thin — never pad out to a count.
- Each story should be a genuinely different ANGLE, not a rephrasing of another: trend over time, segment or cohort comparison, funnel or conversion step, outlier or anomaly detection, a join across tables revealing something neither table shows alone, a simple but valuable rollup. Only include angles the schema genuinely supports.
- SQL must be written for the EXACT dialect given — correct date functions, correct LIMIT/TOP syntax, correct quoting conventions for that specific database. Never write generic SQL and call it done.
- SQL should be immediately runnable as-is against a schema matching what was described, formatted cleanly with real line breaks and indentation, not a single unreadable line.
- description: one or two sentences, plain language, explaining what the query reveals and why someone would care, not a restatement of the SQL.
- Writing style — do not join two clauses with an em-dash, en-dash, or a spaced hyphen anywhere in title or description. Use a period, comma, or a connecting word instead.
- If the schema as given is too thin to support any genuine story (e.g. one table with one column), say so honestly in a single story entry rather than inventing something hollow.

Return ONLY valid JSON, no markdown, no explanation, matching exactly:
{
  "stories": [
    { "title": "string", "description": "string", "sql": "string" }
  ]
}`

function formatSchemaForPrompt(tables: TableInput[]): string {
  return tables
    .map((t) => {
      const cols = t.columns
        .filter((c) => c.name.trim())
        .map((c) => {
          const typePart = c.type.trim() ? ` (${c.type.trim()})` : ''
          const descPart = c.description.trim() ? ` — ${c.description.trim()}` : ''
          return `  - ${c.name.trim()}${typePart}${descPart}`
        })
        .join('\n')
      const notesPart = t.notes.trim() ? `\nNotes: ${t.notes.trim()}` : ''
      return `### ${t.name.trim()}\n${cols}${notesPart}`
    })
    .join('\n\n')
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limitCheck = await checkCreditLimit()
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: 'CREDIT_LIMIT_EXCEEDED',
        message: "You've used all your credits for this month.",
        creditsUsed: limitCheck.creditsUsed,
        creditsLimit: limitCheck.creditsLimit,
        isPaid: limitCheck.isPaid,
      },
      { status: 402 }
    )
  }

  const { tables, dialect }: { tables: TableInput[]; dialect: string } = await req.json()

  const cleanedTables = (tables || []).filter(
    (t) => t.name?.trim() && t.columns?.some((c) => c.name?.trim())
  )
  if (cleanedTables.length === 0) {
    return NextResponse.json(
      { error: 'Add at least one table with at least one named column first.' },
      { status: 400 }
    )
  }

  const dialectLabel = DIALECT_LABELS[dialect] || DIALECT_LABELS.postgres
  const schemaText = formatSchemaForPrompt(cleanedTables)

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `SQL dialect: ${dialectLabel}\n\nSchema:\n${schemaText}\n\nPropose the stories and write the SQL for each, in ${dialectLabel} syntax.`,
        },
      ],
    })

    await logTokenUsage({
      projectId: null,
      route: 'schema_stories',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    })

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const cleaned = raw.replace(/```json|```/g, '').trim()

    let parsed: { stories: { title: string; description: string; sql: string }[] }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse schema stories output:', cleaned.slice(0, 300))
      return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
    }

    const stories = (parsed.stories || []).map((s) => ({
      title: stripDashJoins(s.title || ''),
      description: stripDashJoins(s.description || ''),
      sql: s.sql || '',
    }))

    return NextResponse.json({ stories })
  } catch (err) {
    console.error('Schema stories generation failed:', err)
    return NextResponse.json({ error: 'Story generation failed' }, { status: 500 })
  }
}
