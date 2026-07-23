/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bảng màu công nghiệp Tokinarc — nền thép, accent lửa hàn.
        // Giá trị thật nằm ở CSS custom properties (src/styles/index.css),
        // đổi theo `data-theme` trên <html> — xem ThemeToggle/useTheme.
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          2: 'rgb(var(--ink-2) / <alpha-value>)',
          3: 'rgb(var(--ink-3) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        flame: {
          DEFAULT: 'rgb(var(--flame) / <alpha-value>)',
          hi: 'rgb(var(--flame-hi) / <alpha-value>)',
        },
        txt: {
          DEFAULT: 'rgb(var(--txt) / <alpha-value>)',
          2: 'rgb(var(--txt-2) / <alpha-value>)',
        },
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
