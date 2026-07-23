/**
 * Tokinarc frontend — src/components/ThemeToggle.tsx
 * Nút đổi giao diện sáng/tối, đặt trên header cạnh chuông thông báo.
 */
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/theme/store'

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
      aria-label="Đổi giao diện sáng/tối"
      className="text-txt-2 hover:text-txt p-1.5 rounded-md hover:bg-ink-3 transition-colors"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
