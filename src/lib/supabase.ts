import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// accessToken wires this client into Clerk's session — this is what lets
// Supabase's RLS policies actually know which user is making a request,
// via auth.jwt()->>'sub' (Clerk's user ID claim). Without this, every
// request looked identical to Postgres regardless of who was logged in,
// which is why every table's RLS policy had defaulted to "allow all."
//
// Uses the global `Clerk` object rather than the useSession() hook so this
// stays a single static client, matching how every file in this app
// already imports { supabase } — no need to refactor every call site into
// a hook-based pattern. This is Supabase's own documented pattern for
// exactly this situation (see their "Bring Your Own Clerk" post).
//
// Guarded for SSR safety: `window` doesn't exist server-side. This client
// is only ever used from 'use client' components in this app, so the
// callback itself only ever actually runs in the browser — the guard just
// prevents a crash if this module ever got evaluated in a server context.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => {
    if (typeof window === 'undefined') return null
    // @ts-ignore — Clerk attaches itself to window once ClerkProvider mounts
    return (await window.Clerk?.session?.getToken()) ?? null
  },
})
