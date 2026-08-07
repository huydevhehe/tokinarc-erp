/**
 * Tokinarc frontend — src/pages/purchasing/PODetailModal.tsx
 * Xem chi tiết đơn mua (read-only) trước khi duyệt: NCC, kho, dòng hàng, tổng.
 */
import type { ReactNode } from 'react'
import { Download, ShoppingCart } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Tag, Button } from '@/components/ui'
import { formatVnd } from '@/lib/crm'

export interface PODetail {
  id: string; code: string; supplier_name: string; warehouse_code: string
  status: string; status_display: string; total_vnd: string; owner_username?: string
  notes?: string
  expected_date?: string | null; carrier?: string; tracking_no?: string
  payment_terms_note?: string
  lines: { id?: string; part: string; part_name?: string; qty: number; unit_cost: string | number; tax_pct?: string | number | null }[]
}

const TONE: Record<string, 'gray' | 'blue' | 'warn' | 'ok' | 'danger' | 'purple'> = {
  draft: 'gray', approved: 'blue', rejected: 'danger',
  ordered: 'purple', partial: 'warn', received: 'ok', cancelled: 'danger',
}

export function PODetailModal({ po, open, onClose, footer, onExport }: {
  po: PODetail | null; open: boolean; onClose: () => void; footer?: ReactNode; onExport?: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} wide
      title={po ? `Đơn mua ${po.code}` : 'Đơn mua'}
      icon={<ShoppingCart size={18} className="text-flame" />}
      footer={footer ?? (
        <>
          {onExport && (
            <Button variant="ghost" onClick={onExport}>
              <Download size={13} /> Excel
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
        </>
      )}>
      {po && (() => {
        const subtotal = po.lines.reduce((s, l) => s + Number(l.unit_cost) * l.qty, 0)
        const taxTotal = po.lines.reduce((s, l) => {
          const pct = l.tax_pct != null && l.tax_pct !== '' ? Number(l.tax_pct) : 0
          return s + (Number(l.unit_cost) * l.qty * pct) / 100
        }, 0)
        const grandTotal = subtotal + taxTotal
        return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Nhà cung cấp" value={po.supplier_name} />
            <Info label="Kho nhận" value={po.warehouse_code} />
            <Info label="Người tạo" value={po.owner_username ?? '—'} />
            <Info label="Trạng thái" value={<Tag tone={TONE[po.status] ?? 'gray'}>{po.status_display}</Tag>} />
            <Info label="Dự kiến hàng về" value={po.expected_date || '—'} />
            <Info label="Vận chuyển" value={[po.carrier, po.tracking_no].filter(Boolean).join(' · ') || '—'} />
          </div>

          {po.payment_terms_note && (
            <div>
              <div className="text-xs text-txt-2 mb-1">Điều kiện thanh toán (công nợ phải trả NCC)</div>
              <p className="text-sm bg-flame/10 border border-flame/30 text-txt rounded-md px-3 py-2 whitespace-pre-wrap">
                {po.payment_terms_note}
              </p>
            </div>
          )}

          <div>
            <div className="text-xs text-txt-2 mb-1.5">Chi tiết dòng hàng</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-txt-2 text-[11px] uppercase tracking-wide">
                  <th className="text-left py-1.5">Mã part</th>
                  <th className="text-left">Tên</th>
                  <th className="text-right">SL</th>
                  <th className="text-right">Đơn giá</th>
                  <th className="text-right">Thuế %</th>
                  <th className="text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l, i) => (
                  <tr key={l.id ?? i} className="border-b border-line/40 last:border-0">
                    <td className="py-1.5 font-mono text-flame">{l.part}</td>
                    <td>{l.part_name ?? '—'}</td>
                    <td className="text-right tabular-nums">{l.qty}</td>
                    <td className="text-right tabular-nums">{formatVnd(l.unit_cost)}</td>
                    <td className="text-right tabular-nums text-txt-2">{l.tax_pct != null && l.tax_pct !== '' ? `${l.tax_pct}%` : '—'}</td>
                    <td className="text-right tabular-nums">{formatVnd(Number(l.unit_cost) * l.qty)}</td>
                  </tr>
                ))}
                {po.lines.length === 0 && (
                  <tr><td colSpan={6} className="py-3 text-center text-txt-2">Không có dòng nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-line pt-3 space-y-1">
            <div className="flex justify-end items-baseline gap-2">
              <span className="text-txt-2 text-sm">Tổng tiền hàng (trước thuế):</span>
              <span className="tabular-nums text-sm">{formatVnd(subtotal)}</span>
            </div>
            <div className="flex justify-end items-baseline gap-2">
              <span className="text-txt-2 text-sm">Tiền thuế:</span>
              <span className="tabular-nums text-sm">{formatVnd(taxTotal)}</span>
            </div>
            <div className="flex justify-end items-baseline gap-2">
              <span className="text-txt-2 text-sm">Tổng thanh toán (sau thuế):</span>
              <span className="font-bold text-flame tabular-nums text-base">{formatVnd(grandTotal)}</span>
            </div>
          </div>

          {po.notes && (
            <div>
              <div className="text-xs text-txt-2 mb-1">Ghi chú</div>
              <p className="text-sm bg-ink-3 rounded-md px-3 py-2 whitespace-pre-wrap">{po.notes}</p>
            </div>
          )}
        </div>
        )
      })()}
    </Modal>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-txt-2">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  )
}
