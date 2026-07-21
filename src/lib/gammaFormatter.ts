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

// Chart type is a SOFT SIGNAL only — Gamma has no per-card "render as X"
// parameter in its generation API, so this can only ever be a text hint
// inside additionalInstructions, not a guarantee. Returns null for types
// that don't map to a meaningful visual suggestion (e.g. 'table', or
// 'hero_stat_only' — that one is handled separately below, since it means
// the opposite of a chart suggestion: no visual at all).
function chartTypeHint(type: string | undefined, cardLabel: string): string | null {
  if (!type) return null
  const phrase: Record<string, string> = {
    bar: 'a bar chart',
    grouped_bar: 'a grouped/comparison bar chart',
    line: 'a line chart',
    area: 'an area chart',
    pie: 'a pie or donut chart',
    treemap: 'a treemap',
    scatter: 'a scatter plot',
    composed: 'a dual-axis chart',
  }
  const p = phrase[type]
  if (!p) return null
  return `"${cardLabel}" → ${p} if a visual fits`
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

// Turns an indexed chart's data array into a real markdown table — the
// one case where Gamma receives actual chart numbers instead of just a
// text description. Column headers come from the data's own keys
// (everything except "name"), turned into a readable label the same way
// chart series names are elsewhere in the app (underscores -> spaces).
function buildIndexedDataTable(data: Record<string, any>[]): string {
  if (data.length === 0) return ''
  const seriesKeys = Object.keys(data[0]).filter((k) => k !== 'name')
  if (seriesKeys.length === 0) return ''

  const headerLabels = seriesKeys.map((k) => `${k.replace(/_/g, ' ')} (indexed)`)
  const header = `| Period | ${headerLabels.join(' | ')} |`
  const divider = `| --- | ${seriesKeys.map(() => '---').join(' | ')} |`
  const rows = data.map((row) => `| ${row.name} | ${seriesKeys.map((k) => row[k]).join(' | ')} |`)
  return [header, divider, ...rows].join('\n')
}

export function formatForGamma(input: GammaFormatterInput): GammaFormatterOutput {
  const {
    confirmedAnalysis,
    selectedFindings,
    // projectRecommendations intentionally NOT destructured — recommendations
    // now come through selectedFindings (sel.type === 'recommendation') like
    // every other selectable item, not as a separate auto-included list.
    // Left in the input type/callers for backward compatibility, just unused
    // here now.
    projectName,
    tone,
    targetCompany,
    targetAudience,
    primaryColor,
    logoUrl,
  } = input

  const sections: string[] = []
  // Collected alongside sections — soft chart-type suggestions per card,
  // folded into additionalInstructions below. Never a guarantee.
  const chartHints: string[] = []
  // Cards where the user explicitly picked "Hero number only (no chart)"
  // in SlideSelector. Kept separate from chartHints since this is the
  // opposite instruction — omit a visual entirely — not a preference among
  // visual types, so it needs its own sentence rather than being folded
  // into the "suggested chart types" phrasing.
  const heroOnlyCards: string[] = []
  // How many recommendation cards actually got built from explicit user
  // selections in the loop below — used further down to decide whether the
  // suggestedFollowUps fallback should fire (only when the user selected
  // zero recommendations, not "whenever project.recommendations is empty"
  // like the old logic did). Also doubles as the source data for the one
  // combined "Recommended Next Steps" card built after the loop — James
  // wants all selected recommendations on one slide, not one slide each.
  const selectedRecommendations: any[] = []
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

    if (sel.type === 'recommendation' && sel.recommendation) {
      // James wants selected recommendations combined into ONE slide on
      // export, not one slide per recommendation (unlike findings/tables/
      // visuals, which each get their own card). Collected here instead of
      // pushed immediately — the combined card gets built once, after this
      // loop, from everything gathered in selectedRecommendations.
      selectedRecommendations.push(sel)
      continue
    }

    if (sel.type === 'visual' && sel.chart) {
      // Visual selections come from an already AI-built chart (project.charts),
      // not a raw KeyFinding — so label/heroStat/takeaway are read off the
      // chart object itself, falling back to the user's edited values in
      // sel.heroStat / sel.takeaway (set via SlideSelector's Detailed mode).
      // Gamma only ever receives text here, same as findings — the actual
      // chart image isn't sent, Gamma builds its own visual from the outline.
      // This holds true even for hero_stat_only selections below — the card
      // content itself (heroStat/label/takeaway) doesn't change, only the
      // instruction about whether Gamma should add a visual for it.
      const label = sel.chart.title || ''
      const heroStat = sel.heroStat || sel.chart.hero_stat || ''
      const takeaway = cleanForSlide(
        sel.takeaway || sel.chart.takeaway || sel.chart.description || ''
      )

      // When the user exported this chart with Indexed active (see
      // SlideSelector's Absolute/Indexed toggle), embed the actual indexed
      // numbers as a real markdown data table — this is the one case where
      // Gamma DOES receive real chart data, rather than just a text
      // description. Reasoning: Gamma has no per-card data-input field at
      // all normally (every other chart here is text-only, soft-suggested
      // chart type), and asking it to independently re-derive the indexing
      // math itself would be even less reliable than the existing
      // chart-type hints. Embedding the real computed values sidesteps
      // that entirely — Gamma just has the numbers to plot or reference
      // directly. Absolute (non-indexed) exports are unaffected and keep
      // the existing text-only behavior.
      const indexedTable =
        sel.isIndexed && sel.chartData && sel.chartData.length > 0
          ? buildIndexedDataTable(sel.chartData)
          : ''

      sections.push(
        [
          heroStat ? `# ${heroStat}` : `# ${label}`,
          heroStat && label ? `## ${label}` : '',
          '',
          takeaway,
          indexedTable ? `\n${indexedTable}` : '',
          indexedTable
            ? `\n*Values above are indexed to each series' own starting point (=100), since the series' actual units differ too much to share one scale. Build the chart from these indexed figures directly, not the original units.*`
            : '',
        ]
          .filter((l) => l !== undefined)
          .join('\n')
      )
      if (sel.chartType === 'hero_stat_only') {
        heroOnlyCards.push(heroStat ? `"${heroStat}" (${label})` : `"${label}"`)
      } else {
        const visualHint = chartTypeHint(sel.chartType, label)
        if (visualHint) chartHints.push(visualHint)
      }
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
    if (sel.chartType === 'hero_stat_only') {
      heroOnlyCards.push(heroStat ? `"${heroStat}" (${label})` : `"${label}"`)
    } else {
      const findingHint = chartTypeHint(sel.chartType, label)
      if (findingHint) chartHints.push(findingHint)
    }
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

  // ── Recommendations card ────────────────────────────────────────────────
  // Every selected recommendation is combined into ONE "Recommended Next
  // Steps" card here — not one slide per recommendation, unlike findings/
  // tables/visuals, which each get their own card. This still respects the
  // user's actual selection (only recommendations they picked go in, and
  // in the order they were selected), it's just rendered as one shared
  // card rather than N separate ones. The suggestedFollowUps fallback
  // below only fires when the user selected NONE (not "whenever
  // project.recommendations happens to be empty," which was the old
  // trigger condition) — a safety net so a deck isn't missing a "next
  // steps" card entirely just because nobody touched that section.
  if (selectedRecommendations.length > 0) {
    sections.push(
      [
        '# Recommended Next Steps',
        '',
        ...selectedRecommendations.map((sel, i) => {
          const rec = sel.recommendation
          const title = rec.title || ''
          const description = cleanForSlide(sel.takeaway || rec.description || '')
          const stat = sel.heroStat || rec.stat || ''
          return [
            `**${rec.number || String(i + 1).padStart(2, '0')} ${title}**`,
            description,
            stat ? `**${stat}** ${rec.stat_label || ''}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        }),
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
    // Soft signal only — these are suggestions, not requirements. Gamma
    // should still use its own judgment on what best represents each card.
    chartHints.length > 0
      ? `For visual/chart cards, these are suggested (not required) chart types based on the user's preference: ${chartHints.join('; ')}. Use your own judgment if a different visual better represents the data.`
      : null,
    // A separate, more direct instruction from chartHints above — this is
    // an explicit opt-out of a visual entirely, not a preference among
    // visual types, so it's phrased as a directive rather than a
    // suggestion. Still not a hard guarantee (no Gamma API field enforces
    // this), but stronger wording than the "suggested chart type" phrasing.
    heroOnlyCards.length > 0
      ? `For these specific cards, do not add any chart, graph, or visual at all — just the large hero number and a short callout beneath it, same as a plain stat card: ${heroOnlyCards.join('; ')}.`
      : null,
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
    // Guarded with typeof, not just `|| defaultAudience(tone)` — a truthy
    // non-string value (e.g. the target_audience tailoring OBJECT, which
    // is what caused this exact bug: Gamma's API rejected the request with
    // "textOptions.audience must be a string" when an object slipped
    // through here) would otherwise still pass the `||` check and reach
    // Gamma's API unchanged. This is Gamma's own hard requirement — a
    // simple string ≤500 chars — so it's worth enforcing right at this
    // boundary, not just trusting every caller to always pass a string.
    audience:
      typeof targetAudience === 'string' && targetAudience ? targetAudience : defaultAudience(tone),
    additionalInstructions: instructions,
    themeInstructions,
    numCards: sections.length,
  }
}
