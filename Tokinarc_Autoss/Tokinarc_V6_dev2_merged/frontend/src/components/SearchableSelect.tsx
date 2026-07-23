/**
 * Tokinarc frontend — src/components/SearchableSelect.tsx
 * Ô chọn 1 giá trị từ danh sách DÀI (vài trăm/nghìn dòng) kèm ô gõ để lọc —
 * thay cho <select> thường phải cuộn tay tìm (VD chọn mặt hàng ở phiếu nhập/
 * xuất kho: 837 phụ tùng + 122 súng hàn gộp chung).
 *
 * Component "câm" (controlled: value/onChange) để ghép được vào bất kỳ form
 * nào (kể cả react-hook-form qua setValue), không phụ thuộc thư viện ngoài.
 */
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { Option } from '@/components/form'

const MAX_VISIBLE = 200   // tránh render hàng nghìn dòng cùng lúc khi chưa gõ lọc

export function SearchableSelect({ value, onChange, options, loading, placeholder, disabled }: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  loading?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-txt-2 pointer-events-none" />
        <input
          value={open ? query : (selected?.label ?? '')}
          disabled={disabled}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          placeholder={loading ? 'Đang tải…' : (placeholder ?? 'Gõ để tìm…')}
          className="w-full bg-ink-3 border border-line rounded-md pl-7 pr-2 py-1.5 text-sm focus:border-flame focus:outline-none disabled:opacity-50"
        />
      </div>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-line bg-ink-2 shadow-lg">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-txt-2">Không tìm thấy — thử từ khoá khác.</div>
          )}
          {filtered.slice(0, MAX_VISIBLE).map((o) => (
            <button key={o.value} type="button"
              onClick={() => { onChange(o.value); setOpen(false); setQuery('') }}
              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-ink-3 ${
                o.value === value ? 'text-flame font-medium' : ''
              }`}>
              {o.label}
            </button>
          ))}
          {filtered.length > MAX_VISIBLE && (
            <div className="px-3 py-1.5 text-[11px] text-txt-2 border-t border-line">
              Còn {filtered.length - MAX_VISIBLE} kết quả — gõ thêm để lọc bớt.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
