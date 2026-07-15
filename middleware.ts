import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Added '/pricing' — this was the actual cause of the pricing page being
// unreachable. Every route not listed here gets auth.protect()'d below,
// which redirects to sign-in before the page ever renders. A pricing page
// needs to be visible to logged-out prospects, so it has to be explicit
// here rather than relying on the page component's own (lack of) auth check.
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/pricing(.*)'])

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) {
    auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
