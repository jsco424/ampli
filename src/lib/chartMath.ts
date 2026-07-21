// Chart types where "indexed to first value = 100" is a meaningful way to
// read the data — proportional/part-of-whole types (pie, treemap) don't
// benefit from this, since indexing only makes sense for series tracked
// across points (time, categories in sequence).
export const INDEXABLE_CHART_TYPES = new Set(['bar', 'line', 'area', 'composed'])

// Pure arithmetic on numbers the AI already computed and verified — no
// model call involved. For each numeric series (every key except "name"),
// re-expresses every point as a percentage of that SAME series' own first
// value. This is what lets a chart like "spend vs. ROAS" — where spend is
// in the tens of thousands and ROAS is a single digit — show both lines'
// actual shape/trend on one axis, since each series becomes relative to
// its own starting point instead of sharing one absolute scale.
export function indexToFirstValue(data: Record<string, any>[]): Record<string, any>[] {
  if (data.length === 0) return data
  const keys = Object.keys(data[0]).filter((k) => k !== 'name' && typeof data[0][k] === 'number')
  const baselines: Record<string, number> = {}
  for (const k of keys) {
    baselines[k] = data[0][k] || 1 // avoid divide-by-zero if the first point happens to be 0
  }
  return data.map((row) => {
    const indexed: Record<string, any> = { name: row.name }
    for (const k of keys) {
      indexed[k] = Math.round((row[k] / baselines[k]) * 1000) / 10 // one decimal place
    }
    return indexed
  })
}
