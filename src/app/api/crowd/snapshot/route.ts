import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — same reasoning as api/crowd/route.ts: this has no
// Clerk session to attach a token from, so it needs the service role key
// to write under RLS at all.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A shared secret, not a Clerk session — this route is meant to be called
// by a scheduler (Vercel Cron, or any external cron hitting this URL),
// never by a logged-in user's browser. Without this check, the endpoint
// would be a public, unauthenticated way to force a snapshot at will.
// CROWD_SNAPSHOT_SECRET needs to be set in the environment and match
// whatever the scheduler sends.
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization')
  return (
    !!process.env.CROWD_SNAPSHOT_SECRET && auth === `Bearer ${process.env.CROWD_SNAPSHOT_SECRET}`
  )
}

// THIS ROUTE DOES NOTHING ON ITS OWN. Something has to call it once a
// month for crowd_insights_history to ever accumulate real data — the
// obvious choice is a Vercel Cron entry in vercel.json:
//   { "crons": [{ "path": "/api/crowd/snapshot", "schedule": "0 6 1 * *" }] }
// (6am UTC on the 1st of each month) — but Vercel Cron sends its own
// verification header, not this bearer token, so if that's the chosen
// route the auth check above needs to switch to checking
// req.headers.get('authorization') against process.env.CRON_SECRET per
// Vercel's own convention instead. Whichever scheduler ends up wired to
// this, nothing here starts happening automatically — this is the
// prerequisite piece, not the whole mechanism.
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Snapshot date is always the 1st of the current month — a snapshot
  // represents "the pool's state as of this month," not the exact day the
  // job happened to run (which matters if the job is ever retried or runs
  // a few hours late).
  const now = new Date()
  const snapshotDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data: industries, error } = await supabase.from('crowd_insights').select('*')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!industries || industries.length === 0) {
    return NextResponse.json({ snapshotted: 0, note: 'No industries in crowd_insights yet' })
  }

  const rows = industries.map((ind: any) => ({
    industry: ind.industry,
    snapshot_date: snapshotDate,
    avg_revenue_growth: ind.avg_revenue_growth,
    avg_revenue_growth_n: ind.avg_revenue_growth_n,
    avg_conversion_rate: ind.avg_conversion_rate,
    avg_conversion_rate_n: ind.avg_conversion_rate_n,
    avg_customer_growth: ind.avg_customer_growth,
    avg_customer_growth_n: ind.avg_customer_growth_n,
    extended_metrics: ind.metrics?.extendedMetrics || {},
    contribution_count: ind.contribution_count,
  }))

  // Upsert on (industry, snapshot_date) rather than insert — if this job
  // is ever accidentally triggered twice in the same month (a retry, a
  // manual re-run), it overwrites that month's snapshot with a fresher
  // read instead of erroring or creating a duplicate row. This is safe
  // specifically because within the SAME still-open month, the underlying
  // numbers are still supposed to be live-updating anyway (see the
  // calendar-year cutoff writeup) — re-snapshotting today's numbers today
  // is just capturing the current live state again, not rewriting history.
  // A PAST month's row is never touched again once a later month's
  // snapshot has been taken, since nothing ever re-runs this job for a
  // month that's already closed.
  const { error: upsertError } = await supabase
    .from('crowd_insights_history')
    .upsert(rows, { onConflict: 'industry,snapshot_date' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ snapshotted: rows.length, snapshotDate })
}
