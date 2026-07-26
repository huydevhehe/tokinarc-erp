/**
 * Tokinarc frontend — src/components/form.tsx
 * Primitive form field bám theme, forwardRef để dùng trực tiếp với
 * react-hook-form `register()`. Mỗi field có label + thông báo lỗi.
 */
import { forwardRef, type ReactNode } from 'react'

const LABEL = 'block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1'
const BASE =
  'w-full bg-ink-3 border border-line rounded-md px-2.5 py-2 text-sm text-txt ' +
  'focus:outline-none focus:border-flame transition-colors disabled:opacity-60'

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">{children}</div>
}

function Wrap({ label, error, full, children }: {
  label: string; error?: string; full?: boolean; children: ReactNode
}) {
  return (
    <div className={full ? 'col-span-2 mb-3' : ''}>
      <label className={LABEL}>{label}</label>
      {children}
      {error && <p className="text-danger text-[11px] mt-1">{error}</p>}
    </div>
  )
}

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; full?: boolean }
>(function TextInput({ label, error, full, type, onFocus, ...props }, ref) {
  // Ô số mặc định 0/1: con trỏ không tự bôi đen khi focus nên gõ số mới bị
  // dính vào số cũ (VD gõ "2" thành "02"). Bôi đen toàn bộ khi focus để gõ
  // là thay hẳn, giữ nguyên onFocus của nơi gọi nếu có truyền riêng.
  const handleFocus = type === 'number'
    ? (e: React.FocusEvent<HTMLInputElement>) => { onFocus?.(e); e.target.select() }
    : onFocus
  return (
    <Wrap label={label} error={error} full={full}>
      <input ref={ref} type={type} onFocus={handleFocus} {...props} className={BASE} />
    </Wrap>
  )
})

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }
>(function TextArea({ label, error, ...props }, ref) {
  return (
    <Wrap label={label} error={error} full>
      <textarea ref={ref} {...props} className={`${BASE} min-h-[70px] resize-y`} />
    </Wrap>
  )
})

/** Ô nhập tiền: tự chấm phân cách nghìn khi gõ (VD gõ "2000000" hiện "2.000.000").
 * Value/onChange làm việc với number thô (không dấu chấm) — chỉ định dạng hiển thị.
 * Export riêng 2 hàm này cho chỗ nào cần render input "trần" (không label/Wrap,
 * VD dòng hàng dạng lưới) mà vẫn tự chấm số giống MoneyInput. */
export function formatMoneyDisplay(v: number | string): string {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\D/g, ''))
  return n ? n.toLocaleString('vi-VN') : ''
}
export function parseMoneyInput(raw: string): number {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? 0 : Number(digits)
}

export const MoneyInput = forwardRef<
  HTMLInputElement,
  {
    label: string; error?: string; full?: boolean; placeholder?: string
    disabled?: boolean; value: number | string; onChange: (v: number) => void
  }
>(function MoneyInput({ label, error, full, placeholder, disabled, value, onChange }, ref) {
  return (
    <Wrap label={label} error={error} full={full}>
      <input ref={ref} type="text" inputMode="numeric" disabled={disabled}
        placeholder={placeholder}
        value={formatMoneyDisplay(value)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(parseMoneyInput(e.target.value))}
        className={BASE} />
    </Wrap>
  )
})

export interface Option { value: string; label: string }

export const SelectInput = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    label: string; error?: string; full?: boolean; options: Option[]; placeholder?: string
  }
>(function SelectInput({ label, error, full, options, placeholder, ...props }, ref) {
  return (
    <Wrap label={label} error={error} full={full}>
      <select ref={ref} {...props} className={BASE}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Wrap>
  )
})
