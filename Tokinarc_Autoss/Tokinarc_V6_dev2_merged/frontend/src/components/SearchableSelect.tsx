/**
 * Tokinarc frontend — src/components/SearchableSelect.tsx
 * Ô chọn 1 giá trị từ danh sách DÀI (vài trăm/nghìn dòng) kèm ô gõ để lọc —
 * thay cho <select> thường phải cuộn tay tìm (VD chọn mặt hàng ở phiếu nhập/
 * xuất kho: 837 phụ tùng + 122 súng hàn gộp chung).
 *
 * Component "câm" (controlled: value/onChange) để ghép được vào bất kỳ form
 * nào (kể cả react-hook-form qua setValue), không phụ thuộc thư viện ngoài.
 *
 * Danh sách gợi ý render qua PORTAL vào document.body (position: fixed, toạ độ
 * lấy từ getBoundingClientRect) — không phải con của ô input trong DOM nữa, để
 * KHÔNG bị modal cha (overflow-y-auto, VD form Tạo đơn mua nhiều dòng) cắt mất
 * phần dưới khi ô nằm gần đáy vùng cuộn. Không tự lật lên trên khi sát đáy màn
 * hình — đủ dùng cho các modal hiện tại, chưa cần phức tạp hơn.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import type { Option } from '@/components/form'

const MAX_VISIBLE = 200   // tránh render hàng nghìn dòng cùng lúc khi chưa gõ lọc

export function SearchableSelect({ value, onChange, options, loading, placeholder, disabled, allowCreate }: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  loading?: boolean
  placeholder?: string
  disabled?: boolean
  // Cho phép gõ 1 giá trị KHÔNG có trong danh sách (VD số PO chưa nhập vào hệ
  // thống) — hiện thêm dòng "+ Dùng '...'" để commit thẳng chuỗi vừa gõ.
  allowCreate?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updatePos = () => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }

  useEffect(() => {
    if (!open) return
    updatePos()
    // capture:true — bắt được cả cuộn bên trong modal (overflow-y-auto), không
    // chỉ cuộn trang ngoài cùng.
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false); setQuery('')
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  // Gõ 1 chuỗi không khớp option nào + cho phép tự tạo → cho commit thẳng.
  const canCreate = allowCreate && q.length > 0 && !options.some((o) => o.label.toLowerCase() === q)
  // Đóng, không có option khớp value (giá trị tự gõ trước đó) → vẫn hiện lại chuỗi đã gõ.
  const closedDisplay = selected?.label ?? (allowCreate ? value : '')

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-txt-2 pointer-events-none" />
        <input
          value={open ? query : closedDisplay}
          disabled={disabled}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          placeholder={loading ? 'Đang tải…' : (placeholder ?? 'Gõ để tìm…')}
          className="w-full bg-ink-3 border border-line rounded-md pl-7 pr-2 py-1.5 text-sm focus:border-flame focus:outline-none disabled:opacity-50"
        />
      </div>
      {open && !disabled && pos && createPortal(
        <div ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[100] max-h-56 overflow-y-auto rounded-md border border-line bg-ink-2 shadow-lg">
          {filtered.length === 0 && !canCreate && (
            <div className="px-3 py-2 text-sm text-txt-2">Không tìm thấy — thử từ khoá khác.</div>
          )}
          {canCreate && (
            <button type="button"
              onClick={() => { onChange(query.trim()); setOpen(false); setQuery('') }}
              className="block w-full text-left px-3 py-1.5 text-sm text-flame hover:bg-ink-3 border-b border-line">
              + Dùng "{query.trim()}" (chưa có trong hệ thống)
            </button>
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
        </div>,
        document.body
      )}
    </div>
  )
}
