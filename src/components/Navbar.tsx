'use client'

import { UserButton } from '@clerk/nextjs'
import { useTheme } from '@/hooks/useTheme'
import { Moon, Sun, Menu, X, UploadCloud, Palette, CreditCard } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Projects', href: '/projects' },
  { label: 'Intelligence', href: '/intelligence' },
  { label: 'Research', href: '/research' },
  { label: 'About', href: '/about' },
  { label: 'Pricing', href: '/pricing' },
]

// Intelligence rolls up multiple existing pages (/trends, /crowd, and
// eventually /intelligence/company-benchmarks) that weren't relocated
// under /intelligence's URL — this map is what lets the nav link still
// highlight as active on any of those pages, not just literally on
// /intelligence itself.
const INTELLIGENCE_PATHS = ['/intelligence', '/trends', '/crowd']

export default function Navbar() {
  const { dark, toggle } = useTheme()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/intelligence') return INTELLIGENCE_PATHS.some((p) => pathname.startsWith(p))
    return pathname.startsWith(href)
  }

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b
        ${
          dark
            ? 'bg-[#0a0a0f]/95 border-white/[0.06] backdrop-blur-xl'
            : 'bg-white/95 border-zinc-200/80 backdrop-blur-xl'
        }`}
      >
        {/* Logo — real PNG wordmark, swapped by theme: the navy-on-transparent
            version reads on the light background, the light/white version
            reads on the dark background. Replaces the old CSS-styled text
            wordmark. */}
        <Link href="/dashboard" className="flex flex-col leading-none shrink-0 group">
          <Image
            src={dark ? '/logo-white.png' : '/logo-black.png'}
            alt="am-pli"
            width={175}
            height={71}
            className="h-[26px] w-auto"
            priority
          />
          <span
            className={`text-[9px] tracking-widest font-medium uppercase mt-1 ${dark ? 'text-white/25' : 'text-zinc-400'}`}
          >
            stories, not spreadsheets
          </span>
        </Link>

        {/* Center nav — desktop */}
        <div className="hidden md:flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
                ${
                  isActive(link.href)
                    ? dark
                      ? 'text-white bg-white/8'
                      : 'text-zinc-900 bg-zinc-900/8'
                    : dark
                      ? 'text-white/45 hover:text-white/80 hover:bg-white/5'
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/70'
                }`}
            >
              {link.label}
              {isActive(link.href) && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-px rounded-full bg-[#5DCAA5]" />
              )}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* New Project CTA */}
          <Link
            href="/projects/new"
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150
              bg-[#080C14] text-white hover:bg-[#0F1420] shadow-sm shadow-[#080C14]/20`}
          >
            <UploadCloud size={12} strokeWidth={2.5} />
            New Project
          </Link>

          {/* Divider */}
          <div
            className={`hidden md:block w-px h-5 mx-1 ${dark ? 'bg-white/10' : 'bg-zinc-200'}`}
          />

          {/* Brand settings */}
          <Link
            href="/settings/brand"
            title="Brand Settings"
            className={`p-1.5 rounded-lg transition-colors
              ${dark ? 'text-white/35 hover:text-white/70 hover:bg-white/6' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
          >
            <Palette size={15} />
          </Link>

          {/* Account & Billing */}
          <Link
            href="/account"
            title="Account & Billing"
            className={`p-1.5 rounded-lg transition-colors
              ${dark ? 'text-white/35 hover:text-white/70 hover:bg-white/6' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
          >
            <CreditCard size={15} />
          </Link>

          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className={`p-1.5 rounded-lg transition-colors
              ${dark ? 'text-white/35 hover:text-white/70 hover:bg-white/6' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* User avatar */}
          <UserButton />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`md:hidden p-1.5 rounded-lg transition-colors ml-1
              ${dark ? 'text-white/40 hover:text-white/70 hover:bg-white/6' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
          >
            {mobileOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className={`fixed top-14 left-0 right-0 z-40 border-b shadow-2xl md:hidden
          ${dark ? 'bg-[#0d0d14] border-white/[0.06]' : 'bg-white border-zinc-200'}`}
        >
          <div className="px-4 py-3 space-y-0.5">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    isActive(link.href)
                      ? dark
                        ? 'text-white bg-white/8'
                        : 'text-zinc-900 bg-zinc-100'
                      : dark
                        ? 'text-white/45 hover:text-white/80 hover:bg-white/5'
                        : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/projects/new"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#080C14] text-white hover:bg-[#0F1420] transition-colors mt-1"
            >
              <UploadCloud size={14} />
              New Project
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
