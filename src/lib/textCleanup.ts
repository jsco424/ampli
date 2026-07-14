// Strips the "written by AI" tell of joining two clauses with a dash —
// em dash, en dash, or a spaced hyphen used as punctuation (not a
// hyphenated word like "high-revenue" or "F-150", which have no spaces
// around the hyphen and are left untouched).
//
// Applied server-side immediately after parsing Claude's response, before
// anything is saved or shown — never applied to user-typed edits (e.g.
// Detailed mode in SlideSelector), since a person typing their own dash is
// a legitimate choice, not the pattern this is meant to catch.
export function stripDashJoins(text: string): string {
  if (!text || typeof text !== 'string') return text
  return (
    text
      // em dash or en dash surrounded by spaces: " — " or " – "
      .replace(/\s+[—–]\s+/g, ', ')
      // spaced hyphen used as a clause join: " - " (word-internal hyphens
      // like "high-revenue" have no surrounding spaces, so they're safe)
      .replace(/\s+-\s+/g, ', ')
      // clean up any double-comma artifact this substitution can introduce
      .replace(/,\s*,/g, ',')
      .trim()
  )
}
