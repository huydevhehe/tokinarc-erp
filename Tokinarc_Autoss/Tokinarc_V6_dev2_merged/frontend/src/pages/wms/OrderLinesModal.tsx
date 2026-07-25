/**
 * Tokinarc frontend — src/pages/wms/OrderLinesModal.tsx
 * Modal "Xem nội dung" chung cho phiếu Nhập/Xuất kho: thông tin chung + bảng dòng
 * hàng (mặt hàng + 2 cột số lượng). Read-only.
 */
import type { ReactNode } from 'react'
import { PackageCheck } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { formatVnd } from '@/lib/crm'

export interface DocLine {
  key: string; name: string; code: string; unit?: string; q1: number; q2: number
  unitPrice?: string | null; lineTotal?: string | null; taxPct?: string | number | null
}

export function OrderLinesModal({ open, onClose, title, meta, q1Label, q2Label, lines, showPrice, showTax }: {
  open: boolean; onClose: () => void; title: string; meta?: ReactNode
  q1Label: string; q2Label: string; lines: DocLine[]; showPrice?: boolean; showTax?: boolean
}) {
  const totalQ1 = lines.reduce((s, l) => s + (l.q1 || 0), 0)
  const totalQ2 = lines.reduce((s, l) => s + (l.q2 || 0), 0)
  const totalValue = lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0)
  const totalTax = lines.reduce((s, l) => s + Number(l.lineTotal || 0) * (l.taxPct != null ? Number(l.taxPct) : 0) / 100, 0)
  const cols = 6 + (showPrice ? 2 : 0) + (showTax ? 1 : 0)
  return (
    <Modal open={open} onClose={onClose} wide title={title}
      icon={<PackageCheck size={18} className="text-flame" />}
      footer={<Button variant="ghost" onClick={onClose}>Đóng</Button>}>
      {meta && <div className="mb-3">{meta}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-txt-2 text-[11px] uppercase tracking-wide">
            <th className="text-left py-1.5">Mã</th>
            <th className="text-left">Mặt hàng</th>
            <th className="text-left">ĐVT</th>
            <th className="text-right">{q1Label}</th>
            <th className="text-right">{q2Label}</th>
            <th className="text-right">Lệch</th>
            {showPrice && <th className="text-right">Đơn giá</th>}
            {showPrice && showTax && <th className="text-right">Thuế (%)</th>}
            {showPrice && <th className="text-right">Thành tiền</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const diff = (l.q2 || 0) - (l.q1 || 0)
            const short = diff < 0
            return (
            <tr key={l.key} className={`border-b border-line/40 last:border-0 ${short ? 'bg-danger/5' : ''}`}>
              <td className="py-1.5 font-mono text-flame">{l.code}</td>
              <td>{l.name || '—'}</td>
              <td className="text-txt-2">{l.unit || '—'}</td>
              <td className="text-right tabular-nums">{l.q1}</td>
              <td className="text-right tabular-nums">{l.q2}</td>
              <td className="text-right tabular-nums">
                {short
                  ? <span className="text-danger font-medium">thiếu {-diff}</span>
                  : <span className="text-ok">đủ ✓</span>}
              </td>
              {showPrice && <td className="text-right tabular-nums text-txt-2">{l.unitPrice ? formatVnd(l.unitPrice) : '—'}</td>}
              {showPrice && showTax && (
                <td className="text-right tabular-nums text-txt-2">{l.taxPct != null && l.taxPct !== '' ? `${Number(l.taxPct)}%` : '—'}</td>
              )}
              {showPrice && <td className="text-right tabular-nums">{l.lineTotal ? formatVnd(l.lineTotal) : '—'}</td>}
            </tr>
          )})}
          {lines.length === 0 && (
            <tr><td colSpan={cols} className="py-3 text-center text-txt-2">Không có dòng nào.</td></tr>
          )}
        </tbody>
        {lines.length > 0 && (
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="py-1.5" colSpan={3}>Tổng ({lines.length} dòng)</td>
              <td className="text-right tabular-nums">{totalQ1}</td>
              <td className="text-right tabular-nums">{totalQ2}</td>
              <td className="text-right tabular-nums">
                {totalQ2 - totalQ1 < 0
                  ? <span className="text-danger">thiếu {totalQ1 - totalQ2}</span>
                  : <span className="text-ok">đủ</span>}
              </td>
              {showPrice && <td />}
              {showPrice && showTax && <td />}
              {showPrice && <td />}
            </tr>
            {showPrice && (
              <tr className="text-txt-2">
                <td className="text-right py-1" colSpan={cols - 1}>Tổng tiền hàng</td>
                <td className="text-right tabular-nums">{formatVnd(totalValue)}</td>
              </tr>
            )}
            {showPrice && showTax && (
              <tr className="text-txt-2">
                <td className="text-right py-1" colSpan={cols - 1}>Thuế</td>
                <td className="text-right tabular-nums">{formatVnd(totalTax)}</td>
              </tr>
            )}
            {showPrice && showTax && (
              <tr className="font-semibold">
                <td className="text-right py-1.5 border-t border-line/60" colSpan={cols - 1}>Tổng cộng</td>
                <td className="text-right tabular-nums text-flame border-t border-line/60">{formatVnd(totalValue + totalTax)}</td>
              </tr>
            )}
          </tfoot>
        )}
      </table>
    </Modal>
  )
}
