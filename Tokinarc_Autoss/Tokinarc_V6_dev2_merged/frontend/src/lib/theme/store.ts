/**
 * Tokinarc frontend — src/lib/theme/store.ts
 * Trạng thái theme sáng/tối (zustand). Lưu lựa chọn qua localStorage — mặc
 * định TỐI cho người chưa từng bấm đổi (xem inline script trong index.html
 * set data-theme trước khi React mount, tránh nháy sai theme lúc tải trang).
 */
import { create } from 'zustand'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'tokinarc-theme'

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

interface ThemeState {
  theme: Theme
  toggle: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: currentTheme(),

  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem(THEME_KEY, next)
    set({ theme: next })
  },
}))
