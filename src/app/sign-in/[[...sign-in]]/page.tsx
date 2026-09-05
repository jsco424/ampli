import { SignIn } from '@clerk/nextjs'
import Image from 'next/image'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="mb-8 text-center">
        {/* Real PNG logo, swapped by theme via pure CSS (dark:hidden /
            dark:block) rather than the useTheme() hook Navbar uses — this
            page is a server component with no other need for client-side
            JS, and the CSS approach shows the correct logo immediately
            with no flash while the hook's useEffect would still be
            resolving on first paint. */}
        <Image
          src="/logo-black.png"
          alt="am-pli"
          width={175}
          height={71}
          className="h-10 w-auto mx-auto mb-1 dark:hidden"
          priority
        />
        <Image
          src="/logo-white.png"
          alt="am-pli"
          width={175}
          height={71}
          className="h-10 w-auto mx-auto mb-1 hidden dark:block"
          priority
        />
        <p className="text-zinc-400 text-xs tracking-wide">stories, not spreadsheets</p>
      </div>
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  )
}
