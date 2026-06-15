import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="mb-8 text-center">
        <div className="text-3xl font-bold tracking-tight mb-1">
          <span className="text-blue-500">a</span>
          <span className="text-zinc-400">mp</span>
          <span className="text-blue-400">-</span>
          <span className="text-zinc-400">l</span>
          <span className="text-blue-500">i</span>
        </div>
        <p className="text-zinc-400 text-xs tracking-wide">stories, not spreadsheets</p>
      </div>
      <SignUp fallbackRedirectUrl="/" />
    </div>
  )
}