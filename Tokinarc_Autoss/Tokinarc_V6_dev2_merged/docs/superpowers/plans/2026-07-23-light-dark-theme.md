# Light/Dark Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual light/dark theme toggle that applies across the entire Tokinarc frontend without editing individual pages.

**Architecture:** Convert the existing hardcoded hex color tokens in `tailwind.config.js` (`ink`, `ink-2`, `ink-3`, `line`, `flame`, `flame-hi`, `txt`, `txt-2`, `ok`, `warn`, `danger`) to Tailwind's `rgb(var(--x) / <alpha-value>)` pattern, backed by CSS custom properties defined twice in `index.css` (once for `:root, [data-theme="dark"]`, once for `[data-theme="light"]`). Every existing page already uses these semantic Tailwind classes (`bg-ink-2`, `text-txt-2`, ...), so they re-theme automatically — no per-page edits. A small zustand store (`useTheme`, mirroring the existing `useAuth` pattern) flips the `data-theme` attribute on `<html>` and persists the choice to `localStorage`. An inline script in `index.html` sets `data-theme` before React mounts, to avoid a flash of the wrong theme (FOUC).

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS, zustand, lucide-react (`Sun`/`Moon` icons), Recharts (charts).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-23-light-dark-theme-design.md`
- Default theme for first-time visitors (no `localStorage` value yet): **dark** — must not change the look for existing users.
- No per-page edits — theming must work purely through the shared token layer (`tailwind.config.js` + `index.css`) plus the two flagged hardcoded-color files (`charts.tsx`, `BotConversations.tsx` — the latter turned out to need no change, see Task 3).
- Toggle button lives in `frontend/src/components/Layout.tsx`, in the header, immediately before `<NotificationBell />`.
- No backend changes. No new npm dependencies (zustand and lucide-react are already installed and used elsewhere in this codebase).
- This frontend has no unit-test runner (no jest/vitest configured — confirmed, only Playwright e2e via `npm run test:e2e`, per `docs/dev/DEV_SETUP.md` conventions already followed throughout this codebase). Verification for each FE task is: `npm run typecheck` (must exit 0) → `npm run build` (must succeed) → manual/Playwright visual check. Do not attempt to add jest/vitest — follow the existing project convention.
- Exact RGB decimal triplets (for the Tailwind `rgb(var(--x) / <alpha-value>)` pattern) are computed and given verbatim below — do not recompute or approximate them.

---

### Task 1: CSS-variable color tokens (dark default unchanged, light values added)

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/styles/index.css`
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: nothing (foundational task).
- Produces: Tailwind classes (`bg-ink`, `bg-ink-2`, `bg-ink-3`, `border-line`, `bg-flame`, `bg-flame-hi`, `text-txt`, `text-txt-2`, `text-ok`/`bg-ok`/`border-ok`, `text-warn`/..., `text-danger`/...) now resolve through CSS custom properties instead of static hex — every later task and every existing page relies on this being visually a no-op in the default (dark, no `data-theme` set yet) state. Also produces 6 new chart-only variables `--chart-1` through `--chart-6` consumed by Task 3.

- [ ] **Step 1: Replace the hardcoded hex colors in `tailwind.config.js` with the CSS-variable pattern**

Replace the entire `colors` block:

```js
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
```

- [ ] **Step 2: Define the CSS custom properties for both themes in `index.css`**

Replace the top of the file (everything before the `@keyframes scanline` block) with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Token gốc = theme TỐI (mặc định, giữ nguyên giao diện hiện tại cho người
   dùng cũ). [data-theme="light"] ghi đè khi người dùng tự bấm ThemeToggle —
   xem frontend/src/lib/theme/store.ts. */
:root,
[data-theme="dark"] {
  --ink: 13 17 23;
  --ink-2: 22 27 34;
  --ink-3: 33 38 45;
  --line: 48 54 61;
  --flame: 224 92 27;
  --flame-hi: 249 115 22;
  --txt: 230 237 243;
  --txt-2: 139 148 158;
  --ok: 46 160 67;
  --warn: 210 153 34;
  --danger: 248 81 73;
  /* Bảng màu biểu đồ nhiều chuỗi (charts.tsx) — không dùng cho UI thường. */
  --chart-1: 57 135 229;
  --chart-2: 217 89 38;
  --chart-3: 25 158 112;
  --chart-4: 201 133 0;
  --chart-5: 213 81 129;
  --chart-6: 0 131 0;
  color-scheme: dark;
}

[data-theme="light"] {
  --ink: 255 255 255;
  --ink-2: 246 248 250;
  --ink-3: 234 238 242;
  --line: 208 215 222;
  --flame: 224 92 27;
  --flame-hi: 249 115 22;
  --txt: 31 35 40;
  --txt-2: 101 109 118;
  --ok: 26 127 55;
  --warn: 154 103 0;
  --danger: 207 34 46;
  --chart-1: 42 120 214;
  --chart-2: 235 104 52;
  --chart-3: 27 175 122;
  --chart-4: 237 161 0;
  --chart-5: 232 123 164;
  --chart-6: 0 131 0;
  color-scheme: light;
}

html, body, #root { height: 100%; }
body {
  margin: 0;
  background: rgb(var(--ink));
  color: rgb(var(--txt));
  font-family: Inter, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
*:focus-visible { outline: 2px solid #f97316; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

(Leave the `@keyframes scanline` / `.animate-scanline` block below untouched.)

- [ ] **Step 3: Set `data-theme` before React mounts, to avoid a flash of the wrong theme**

In `frontend/index.html`, add this inline script as the very first thing inside `<head>`, before the `<title>` tag:

```html
<script>
  (function () {
    var t = localStorage.getItem('tokinarc-theme');
    document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
  })();
</script>
```

The full `<head>` should read:

```html
<head>
  <script>
    (function () {
      var t = localStorage.getItem('tokinarc-theme');
      document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
    })();
  </script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tokinarc — Hệ thống nội bộ</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
</head>
```

- [ ] **Step 4: Verify this is a visual no-op (build + typecheck + eyeball)**

Run: `cd frontend && npm run build`
Expected: exits 0, no TypeScript or Tailwind errors.

Then run `npm run dev`, open the app in a browser, and confirm it looks **pixel-identical** to before this task (dark background, same text/border colors everywhere) — since `data-theme` defaults to `"dark"` and the dark RGB values above are the exact same colors as the old hardcoded hex, nothing should visually change yet. Check the login page and at least one authenticated page (e.g. Dashboard).

- [ ] **Step 5: Commit**

```bash
git add frontend/tailwind.config.js frontend/src/styles/index.css frontend/index.html
git commit -m "Add CSS-variable color tokens for light/dark theming (dark default unchanged)"
```

---

### Task 2: Theme store + ThemeToggle button

**Files:**
- Create: `frontend/src/lib/theme/store.ts`
- Create: `frontend/src/components/ThemeToggle.tsx`
- Modify: `frontend/src/components/Layout.tsx:16-19,246-247`

**Interfaces:**
- Consumes: `data-theme` attribute already set on `<html>` by Task 1's inline script.
- Produces: `useTheme()` hook — exported from `frontend/src/lib/theme/store.ts`, returns `{ theme: 'dark' | 'light', toggle: () => void }` (zustand store, called as `useTheme((s) => s.theme)` / `useTheme((s) => s.toggle)` matching the existing `useAuth` call pattern in this codebase). `ThemeToggle` — exported component from `frontend/src/components/ThemeToggle.tsx`, no props.

- [ ] **Step 1: Create the theme store**

Create `frontend/src/lib/theme/store.ts`:

```ts
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
```

- [ ] **Step 2: Create the toggle button component**

Create `frontend/src/components/ThemeToggle.tsx`:

```tsx
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
```

- [ ] **Step 3: Wire the toggle into the header, before the notification bell**

In `frontend/src/components/Layout.tsx`, add the import next to the existing `NotificationBell`/`ProfileModal` imports (around line 18-19):

```tsx
import { NotificationBell } from '@/components/NotificationBell'
import { ProfileModal } from '@/components/ProfileModal'
import { ThemeToggle } from '@/components/ThemeToggle'
```

Then, in the header JSX (around line 246-247), insert `<ThemeToggle />` immediately before `<NotificationBell />`:

```tsx
          <div className="flex-1" />
          <ThemeToggle />
          <NotificationBell />
```

- [ ] **Step 4: Verify — build, then click the toggle in the browser**

Run: `cd frontend && npm run build`
Expected: exits 0.

Run `npm run dev`, log in, click the new sun/moon icon in the header. Confirm:
- The whole page (sidebar, header, cards, tables, text) switches from dark to a light background with dark text, and back, with no crash.
- Reloading the page (F5) after switching to light keeps it light (persisted via `localStorage`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/theme/store.ts frontend/src/components/ThemeToggle.tsx frontend/src/components/Layout.tsx
git commit -m "Add theme store and header toggle button for light/dark switching"
```

---

### Task 3: Make the shared chart component theme-aware

**Files:**
- Modify: `frontend/src/components/charts.tsx`

**Interfaces:**
- Consumes: `--line`, `--txt-2`, `--flame`, `--chart-1`..`--chart-6` CSS variables from Task 1.
- Produces: no change to this component's exported props/signature — purely internal color-value changes.

**Context:** `charts.tsx` currently hardcodes `#30363d` (grid/axis lines, matches `--line`), `#8b949e` (axis text, matches `--txt-2`), and a 6-color `PALETTE` array (`#e05c1b, #58a6ff, #3fb950, #bc8cff, #d29922, #2dd4bf`) used for multi-series bars/cells, plus `#e05c1b` as the single-series fallback fill (matches `--flame`). The `PALETTE` array was validated as a Tokinarc-specific set for dark only; re-running it against a light surface fails (2 categorical colors under 3:1 contrast — see spec's dataviz validation). The 6 `--chart-N` variables defined in Task 1 are a substitute palette (adapted from the dataviz skill's reference palette, itself validated in both modes) — this task only needs to point the component at them, no further validation work.

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Run: `grep -n "PALETTE\|stroke=\|fill=" frontend/src/components/charts.tsx`
Expected output includes the `const PALETTE = [...]` line and the `CartesianGrid`/`XAxis`/`YAxis`/`Cell` lines with hardcoded hex.

- [ ] **Step 2: Replace the hardcoded `PALETTE` array**

Change:
```tsx
const PALETTE = ['#e05c1b', '#58a6ff', '#3fb950', '#bc8cff', '#d29922', '#2dd4bf']
```
to:
```tsx
const PALETTE = [
  'rgb(var(--chart-1))', 'rgb(var(--chart-2))', 'rgb(var(--chart-3))',
  'rgb(var(--chart-4))', 'rgb(var(--chart-5))', 'rgb(var(--chart-6))',
]
```

- [ ] **Step 3: Replace the hardcoded grid/axis colors and the single-series fallback fill**

Change:
```tsx
<CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
<XAxis dataKey="label" stroke="#8b949e" fontSize={11} tickLine={false} axisLine={{ stroke: '#30363d' }} />
<YAxis stroke="#8b949e" fontSize={11} tickLine={false} axisLine={false}
```
to:
```tsx
<CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
<XAxis dataKey="label" stroke="rgb(var(--txt-2))" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgb(var(--line))' }} />
<YAxis stroke="rgb(var(--txt-2))" fontSize={11} tickLine={false} axisLine={false}
```

And change:
```tsx
<Cell key={i} fill={multicolor ? PALETTE[i % PALETTE.length] : '#e05c1b'} />
```
to:
```tsx
<Cell key={i} fill={multicolor ? PALETTE[i % PALETTE.length] : 'rgb(var(--flame))'} />
```

- [ ] **Step 4: Check `BotConversations.tsx` needs no change**

Run: `grep -n "#\[0-9a-fA-F\]" frontend/src/pages/crm/BotConversations.tsx` (or open the file around the `web`/`zalo`/`facebook` channel-badge map).
Expected: the only hardcoded color is `bg-[#1877F2]/20 text-[#5c9bf5]` for the Facebook channel badge — this is Facebook's own brand blue, unrelated to the app's light/dark tokens, and should stay fixed in both themes (same reasoning as keeping `flame`/`flame-hi` constant). No edit needed here; this step is a documented confirmation, not a code change.

- [ ] **Step 5: Verify — build, then view a chart page in both themes**

Run: `cd frontend && npm run build`
Expected: exits 0.

Run `npm run dev`, open a page with a chart (e.g. `/dashboard` or `/forecast`), confirm the chart grid/axis/bars render correctly in dark mode, then click the theme toggle and confirm they re-render with the light-mode colors (readable axis labels, no invisible/near-white-on-white bars).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/charts.tsx
git commit -m "Make shared chart component (charts.tsx) follow the light/dark theme"
```

---

### Task 4: Playwright e2e test for the toggle

**Files:**
- Create: `frontend/e2e/theme-toggle.spec.ts` (gitignored per this project's established convention — local verification only, not committed to git)

**Interfaces:**
- Consumes: `login` helper from `frontend/e2e/helpers.ts` (existing).
- Produces: nothing consumed by other tasks — this is the final verification task.

- [ ] **Step 1: Write the test**

Create `frontend/e2e/theme-toggle.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { login } from './helpers'

/**
 * Nút đổi theme sáng/tối trên header: bấm đổi được, lưu lại qua localStorage,
 * tải lại trang vẫn giữ theme đã chọn.
 */
test('Đổi theme sáng/tối: bấm đổi đúng + lưu lại sau khi tải lại trang', async ({ page }) => {
  await login(page, 'admin', 'admin')
  await page.goto('/dashboard')

  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'dark')

  const toggle = page.getByRole('button', { name: 'Đổi giao diện sáng/tối' })
  await toggle.click()
  await expect(html).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('tokinarc-theme'))).toBe('light')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // đổi lại về tối, dọn sạch cho lần chạy sau
  await page.getByRole('button', { name: 'Đổi giao diện sáng/tối' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
```

- [ ] **Step 2: Run it**

Run: `cd frontend && npx playwright test e2e/theme-toggle.spec.ts --reporter=list`
Expected: `1 passed`.

If the login credentials (`admin`/`admin`) fail, check which admin account currently works on the local dev DB (credentials have changed hands multiple times this session — try `admin`/`admin12345` as a fallback, or whatever the current known-good local dev login is) and adjust the `login(...)` call accordingly; this is a test-environment detail, not a product bug.

- [ ] **Step 3: No commit for this file** (it's gitignored — confirm it doesn't show up in `git status`)

Run: `git status -s frontend/e2e/theme-toggle.spec.ts`
Expected: no output (file is ignored).

---

### Task 5: Manual cross-page visual check (no code changes)

**Files:** none — verification only.

- [ ] **Step 1: With the dev server running, click through these pages in BOTH dark and light mode**, checking that text stays readable and no element looks broken (invisible border, white-on-white, black-on-black):
  - `/login` (logged out)
  - `/dashboard`
  - `/leads` and `/customers` (tables, tags/badges)
  - `/wms/inbound` and `/wms/outbound` (tables, status tags, modals)
  - `/purchasing/orders` (stat cards, tags)
  - Any page with a chart (e.g. `/forecast` or the CEO dashboard) — confirm Task 3's chart fix renders correctly here too.

- [ ] **Step 2: Report back** — if anything looks wrong on a specific page in light mode (e.g. a color that was chosen for dark contrast doesn't work on light, beyond what Task 1-3 already covers), note the exact page + element so it can be fixed as a follow-up — do not silently patch ad-hoc colors into individual pages, since that would violate the "no per-page edits" constraint. Bring it back to the token layer instead.
