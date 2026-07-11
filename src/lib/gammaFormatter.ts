import type { AnalysisOutput } from '@/lib/analysisTypes'

function mapTone(tone?: string): string {
  return (
    {
      executive: 'professional, concise, direct',
      analytical: 'analytical, methodical, data-driven',
      educational: 'informative, clear, neutral',
    }[tone || 'executive'] || 'professional'
  )
}

function defaultAudience(tone?: string): string {
  return (
    {
      executive: 'business executives and senior leadership',
      analytical: 'data analysts and technical stakeholders',
      educational: 'business professionals',
    }[tone || 'executive'] || 'business professionals'
  )
}

export interface GammaFormatterInput {
  confirmedAnalysis: AnalysisOutput
  selectedFindings?: any[]
  // Supabase project.recommendations — the AI-generated action recs,
  // not suggestedFollowUps which are analytical questions
  projectRecommendations?: any[]
  projectName: string
  tone?: string
  targetCompany?: string | null
  targetAudience?: string | null
  primaryColor?: string | null
  logoUrl?: string | null
}

export interface GammaFormatterOutput {
  inputText: string
  title: string
  tone: string
  audience: string
  additionalInstructions: string
  themeInstructions: string
  numCards: number
}

// Strips any meta-instruction artifacts that should never appear as
// slide content — verification badges, footnote markers, bracket tags.
function cleanForSlide(text: string): string {
  return text
    .replace(/✓\s*server-verified/gi, '')
    .replace(/\[CRITICAL\]|\[WARNING\]|\[INFO\]/gi, '')
    .replace(/high confidence|medium confidence|low confidence/gi, '')
    .replace(/n=[\d,]+/gi, '')
    .replace(/·\s*·/g, '·')
    .replace(/^\s*·\s*/gm, '')
    .trim()
}

export function formatForGamma(input: GammaFormatterInput): GammaFormatterOutput {
  const {
    confirmedAnalysis,
    selectedFindings,
    projectRecommendations,
    projectName,
    tone,
    targetCompany,
    targetAudience,
    primaryColor,
    logoUrl,
  } = input

  const sections: string[] = []

  // ── Card 1: Title + executive summary ─────────────────────────────────
  const titleLine = targetCompany ? `# ${projectName} — ${targetCompany}` : `# ${projectName}`

  sections.push([titleLine, '', cleanForSlide(confirmedAnalysis.executiveSummary)].join('\n'))

  // ── Cards 2–N: Findings, Tables, and Visuals ───────────────────────────
  const findings =
    selectedFindings && selectedFindings.length > 0
      ? selectedFindings
      : confirmedAnalysis.keyFindings.map((f) => ({
          type: 'finding',
          finding: f,
          heroStat: f.value,
          takeaway: f.interpretation,
        }))

  for (const sel of findings) {
    if (sel.type === 'table' && sel.table) {
      const { table, takeaway } = sel
      const headerRow = `| ${table.headers.join(' | ')} |`
      const dividerRow = `| ${table.headers.map(() => '---').join(' | ')} |`
      const dataRows = (table.rows || []).slice(0, 5).map(
        (row: any[]) =>
          `| ${row
            .map((cell: any) => {
              const val =
                typeof cell === 'object' && cell !== null ? cell.display : String(cell ?? '')
              return val.replace(/\|/g, '\\|').slice(0, 40) // cap cell length for readability
            })
            .join(' | ')} |`
      )

      sections.push(
        [
          `# ${table.title}`,
          table.description ? `*${table.description}*` : '',
          '',
          headerRow,
          dividerRow,
          ...dataRows,
          takeaway ? `\n**Takeaway:** ${cleanForSlide(takeaway)}` : '',
          table.footnote ? `\n*${table.footnote}*` : '',
        ]
          .filter(Boolean)
          .join('\n')
      )
      continue
    }

    if (sel.type === 'visual' && sel.chart) {
      // Visual selections come from an already AI-built chart (project.charts),
      // not a raw KeyFinding — so label/heroStat/takeaway are read off the
      // chart object itself, falling back to the user's edited values in
      // sel.heroStat / sel.takeaway (set via SlideSelector's Detailed mode).
      // Gamma only ever receives text here, same as findings — the actual
      // chart image isn't sent, Gamma builds its own visual from the outline.
      const label = sel.chart.title || ''
      const heroStat = sel.heroStat || sel.chart.hero_stat || ''
      const takeaway = cleanForSlide(
        sel.takeaway || sel.chart.takeaway || sel.chart.description || ''
      )

      sections.push(
        [
          heroStat ? `# ${heroStat}` : `# ${label}`,
          heroStat && label ? `## ${label}` : '',
          '',
          takeaway,
        ]
          .filter((l) => l !== undefined)
          .join('\n')
      )
      continue
    }

    // Finding card — hero stat H1, label H2, clean takeaway as body.
    // Confidence/sample size kept as a single clean meta line — no
    // verification markers that might render as literal text on the slide.
    const label = sel.finding?.label || ''
    const heroStat = sel.heroStat || sel.finding?.value || ''
    const takeaway = cleanForSlide(sel.takeaway || sel.finding?.interpretation || '')
    const confidence = sel.finding?.confidence
    const sampleSize = sel.finding?.sampleSize

    // Only show meta if it adds meaningful signal — skip on low-info findings
    const metaParts = [
      confidence ? `${confidence} confidence` : null,
      sampleSize ? `n=${sampleSize.toLocaleString()}` : null,
    ].filter(Boolean)

    sections.push(
      [
        `# ${heroStat}`,
        `## ${label}`,
        '',
        takeaway,
        metaParts.length > 0 ? `\n*${metaParts.join(' · ')}*` : '',
      ]
        .filter((l) => l !== undefined)
        .join('\n')
    )
  }

  // ── Anomaly card — max 3, critical first, short descriptions only ──────
  // Cap at 3 and trim descriptions to keep this card scannable.
  // Full anomaly detail lives in the ampli analysis view, not the deck.
  const urgentAnomalies = confirmedAnalysis.anomalies
    .filter((a) => a.severity === 'critical' || a.severity === 'warning')
    .slice(0, 3)

  if (urgentAnomalies.length > 0) {
    const severityLabel = (s: string) => (s === 'critical' ? '🔴' : '🟡')
    sections.push(
      [
        '# Flags & Considerations',
        '',
        ...urgentAnomalies.map((a) =>
          [
            `**${severityLabel(a.severity)} ${a.affectedMetric || a.severity.charAt(0).toUpperCase() + a.severity.slice(1)}**`,
            cleanForSlide(a.description).slice(0, 180) + (a.description.length > 180 ? '…' : ''),
            a.suggestedAction ? `→ ${cleanForSlide(a.suggestedAction)}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        ),
      ].join('\n\n')
    )
  }

  // ── Recommendations card — from project.recommendations (AI-generated
  // action recs), NOT suggestedFollowUps which are analytical questions.
  // Falls back to suggestedFollowUps only if no project recommendations exist.
  const recs =
    projectRecommendations && projectRecommendations.length > 0 ? projectRecommendations : null

  if (recs && recs.length > 0) {
    sections.push(
      [
        '# Recommended Next Steps',
        '',
        ...recs
          .slice(0, 3)
          .map((r: any, i: number) =>
            [
              `**${r.number || String(i + 1).padStart(2, '0')} ${r.title || ''}**`,
              r.description ? cleanForSlide(r.description).slice(0, 200) : '',
              r.stat ? `**${r.stat}** ${r.stat_label || ''}` : '',
            ]
              .filter(Boolean)
              .join('\n')
          ),
      ].join('\n\n')
    )
  } else if (confirmedAnalysis.suggestedFollowUps.length > 0) {
    // Reframe analytical follow-ups as action items for the deck context
    sections.push(
      [
        '# Recommended Next Steps',
        '',
        ...confirmedAnalysis.suggestedFollowUps.slice(0, 3).map((q, i) => `${i + 1}. ${q}`),
      ].join('\n')
    )
  }

  const inputText = sections.join('\n\n---\n\n')

  // ── additionalInstructions ─────────────────────────────────────────────
  // Kept lean and instruction-only — nothing here should end up as visible
  // slide text. Gamma treats this as a behavioral directive, not content.
  const instructions = [
    'Display the H1 heading (the metric) in very large type as the hero stat on each card.',
    'Keep body text concise — one short paragraph maximum per card.',
    'Do not add cards, sections, or content beyond what is provided.',
    'Do not use stock photography or AI-generated scene images.',
    primaryColor
      ? `Use ${primaryColor} as the primary accent color for headings, highlights, and chart elements.`
      : null,
    targetCompany ? `This presentation is prepared for ${targetCompany}.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  // ── themeInstructions ─────────────────────────────────────────────────
  // Separate from additionalInstructions — used by the route to select
  // a theme. Currently a description string; swap for a themeId once
  // a custom Gamma theme is created in the workspace.
  //
  // NOTE: this is exactly the mechanism the brand-color roadmap item
  // depends on — a custom Gamma theme keyed by themeId gives exact hex
  // color reproduction, while this description string only gets Gamma's
  // closest interpretation. When that item gets built, the route should
  // pass user_settings.gamma_theme_id as themeId when present, and only
  // fall back to this description-based themeInstructions when it's not.
  const themeInstructions = [
    'Clean, minimal, data-focused.',
    'Dark navy or white background preferred.',
    primaryColor ? `Primary accent: ${primaryColor}.` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    inputText,
    title: projectName,
    tone: mapTone(tone),
    audience: targetAudience || defaultAudience(tone),
    additionalInstructions: instructions,
    themeInstructions,
    numCards: sections.length,
  }
}
