'use client'

import { useEffect, useState } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('ampli-theme')
    if (stored === 'dark') {
      setDark(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('ampli-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('ampli-theme', 'light')
    }
  }

  return { dark, toggle }
}