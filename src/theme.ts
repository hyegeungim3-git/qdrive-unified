import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

let theme: Theme = (localStorage.getItem('qdrive-theme') as Theme) || 'light'
const listeners = new Set<() => void>()

function apply() {
  document.documentElement.classList.toggle('light', theme === 'light')
}
apply()

export function toggleTheme() {
  theme = theme === 'dark' ? 'light' : 'dark'
  localStorage.setItem('qdrive-theme', theme)
  apply()
  for (const l of listeners) l()
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => theme,
  )
}
