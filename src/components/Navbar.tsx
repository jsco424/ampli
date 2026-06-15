'use client'

import { UserButton } from '@clerk/nextjs'
import { useTheme } from '@/hooks/useTheme'
import { Moon, Sun, Menu, X, UploadCloud, Palette } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_LINKS = [
  { label: 'Dashboard', href: '/', icon: null },
  { label: 'Projects', href: '/projects', icon: null },
  { label: 'Crowd Insights', href: '/crowd', icon: null },
  { label: 'Research', href: '/#research', icon: null },
]

export default function Navbar() {
  const { dark, toggle } = useTheme()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b backdrop-blur-sm
        ${dark ? 'bg-zinc-950/90 border-zinc-800' : 'bg-white/90 border-zinc-200'}`}
      >
        {/* Logo */}
        <Link href="/" className="flex flex-col leading-none shrink-0">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-blue-500">a</span>
            <span className={dark ? 'text-white' : 'text-zinc-400'}>mp</span>
            <span className="text-blue-400">-</span>
            <span className={dark ? 'text-white' : 'text-zinc-400'}>l</span>
            <span className="text-blue-500">i</span>
          </span>
          <span className={`text-[10px] tracking-wide ${dark ? 'text-white' : 'text-zinc-400'}`}>
            stories, not spreadsheets
          </span>
        </Link>

        {/* Center nav links — desktop */}
        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors
                ${
                  isActive(link.href)
                    ? dark
                      ? 'text-white bg-zinc-800'
                      : 'text-zinc-900 bg-zinc-100'
                    : dark
                      ? 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/60'
                }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* New Project CTA */}
          <Link
            href="/projects/new"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
          >
            <UploadCloud size={13} />
            New Project
          </Link>

          {/* Brand settings */}
          <Link
            href="/settings/brand"
            className={`p-2 rounded-full transition-colors
              ${dark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
            title="Brand Settings"
          >
            <Palette size={16} />
          </Link>

          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className={`p-2 rounded-full transition-colors
              ${dark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* User avatar */}
          <UserButton />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`md:hidden p-2 rounded-xl transition-colors
              ${dark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className={`fixed top-14 left-0 right-0 z-40 border-b shadow-lg md:hidden
          ${dark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'}`}
        >
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors
                  ${
                    isActive(link.href)
                      ? dark
                        ? 'text-white bg-zinc-800'
                        : 'text-zinc-900 bg-zinc-100'
                      : dark
                        ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                        : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                  }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/projects/new"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
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
