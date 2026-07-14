import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Current claude-sonnet-4-6 rates — the exact model string every ampli
// route uses. Update these two numbers if the model or its pricing ever
// changes; every future logged call will use whatever's here at log time,
// so past rows stay accurate to what was actually charged even after a
// rate change, as long as this gets updated when Anthropic's pricing does.
const INPUT_RATE_PER_TOKEN = 3 / 1_000_000
const OUTPUT_RATE_PER_TOKEN = 15 / 1_000_000

export type TokenUsageRoute =
  | 'analyze'
  | 'analyze_followup'
  | 'generate_core'
  | 'generate_recommendations'

// Logs one Claude API call's real token usage — call this right after
// every client.messages.create() response, passing response.usage directly.
// Never throws: a logging failure should never break the actual feature
// it's instrumenting, so errors are caught and swallowed with a console
// warning rather than propagated.
export async function logTokenUsage(params: {
  projectId: string | null
  route: TokenUsageRoute
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  const { projectId, route, inputTokens, outputTokens } = params
  const costUsd = inputTokens * INPUT_RATE_PER_TOKEN + outputTokens * OUTPUT_RATE_PER_TOKEN

  try {
    await supabaseAdmin.from('token_usage_log').insert({
      project_id: projectId,
      route,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    })
  } catch (err) {
    console.error('Failed to log token usage (non-fatal):', err)
  }
}
