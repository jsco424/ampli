'use client'

import { useEffect, useState } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('ampli-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored === 'dark' || (!stored && prefersDark)
    setDark(isDark)
    if (isDark) {
      document.documentElement.classList.add('dark')
      document.body.style.backgroundColor = '#09090b'
    } else {
      document.documentElement.classList.remove('dark')
      document.body.style.backgroundColor = '#f9fafb'
    }
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      document.body.style.backgroundColor = '#09090b'
      localStorage.setItem('ampli-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.body.style.backgroundColor = '#f9fafb'
      localStorage.setItem('ampli-theme', 'light')
    }
  }

  return { dark, toggle }
}
