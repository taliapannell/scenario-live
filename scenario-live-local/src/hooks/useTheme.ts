import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const THEME_EVENT = 'theme-change'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('theme') as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    setTheme(next)
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }))
  }

  useEffect(() => {
    const handleExternalChange = (e: Event) =>
      setTheme((e as CustomEvent<Theme>).detail)
    window.addEventListener(THEME_EVENT, handleExternalChange)
    return () => window.removeEventListener(THEME_EVENT, handleExternalChange)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return { theme, toggleTheme }
}
