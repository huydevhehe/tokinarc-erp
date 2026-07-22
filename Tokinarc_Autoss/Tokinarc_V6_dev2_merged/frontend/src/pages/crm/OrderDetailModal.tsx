/**
 * Tokinarc frontend — src/pages/crm/OrderDetailModal.tsx
 * #6 biên bản (2026-07-21): người ký duyệt đơn bán xem lại nội dung/dòng hàng
 * trước khi bấm Ký — trước đây trang Đơn bán không có modal nào cho việc này.
 * Lines không có trong SalesOrderListSerializer nên fetch riêng theo id
 * (SalesOrderDetailSerializer trả đủ `lines`).
 */
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShoppingBag } from 'lucide-react'
import { api } from '@/lib/api'
import { Modal } from '@/components/Modal'
import { Tag, Button } from '@/components/ui'
import { formatVnd, formatDate } from '@/lib/crm'

interface OrderLine {
  id?: string; part: string | null; torch: string | null; description: string
  qty: number; unit_price: string | number; discount_pct: string | number; line_total: string | number
}
interface OrderDetail {
  id: string; code: string; status: string
  issued_date: string | null; ship_address?: string; payment_terms_note?: string
  notes?: string; total_vnd: string | number; lines: OrderLine[]
}

const LABEL: Record<string, string> = {
  draft: 'Nháp', pending: 'Chờ ký', active: 'Hiệu lực', shipping: 'Đang giao',
  completed: 'Hoàn tất', cancelled: 'Hủy',
}
const TONE: Record<string, 'gray' | 'blue' | 'warn' | 'ok' | 'danger' | 'purple'> = {
  draft: 'gray', pending: 'warn', active: 'blue', shipping: 'purple', completed: 'ok', cancelled: 'danger',
}

export function OrderDetailModal({ orderId, orderCode, customerName, open, onClose, footer }: {
  orderId: string | null; orderCode?: string; customerName?: string
  open: boolean; onClose: () => void; footer?: ReactNode
}) {
  const { data: o, isLoading } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: async () => (await api.get<OrderDetail>(`/sales/orders/${orderId}/`)).data,
    enabled: open && !!orderId,
  })

  return (
    <Modal open={open} onClose={onClose} wide
      title={`Đơn bán ${orderCode ?? o?.code ?? ''}`}
      icon={<ShoppingBag size={18} className="text-flame" />}
      footer={footer ?? <Button variant="ghost" onClick={onClose}>Đóng</Button>}>
      {isLoading && <p className="text-sm text-txt-2">Đang tải…</p>}
      {o && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Khách hàng" value={customerName ?? '—'} />
            <Info label="Trạng thái" value={<Tag tone={TONE[o.status] ?? 'gray'}>{LABEL[o.status] ?? o.status}</Tag>} />
            <Info label="Ngày xuất" value={formatDate(o.issued_date)} />
            <Info label="Địa chỉ giao" value={o.ship_address || '—'} />
          </div>

          {o.payment_terms_note && (
            <div>
              <div className="text-xs text-txt-2 mb-1">Điều khoản thanh toán</div>
              <p className="text-sm bg-flame/10 border border-flame/30 text-txt rounded-md px-3 py-2 whitespace-pre-wrap">
                {o.payment_terms_note}
              </p>
            </div>
          )}

          <div>
            <div className="text-xs text-txt-2 mb-1.5">Chi tiết dòng hàng</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-txt-2 text-[11px] uppercase tracking-wide">
                  <th className="text-left py-1.5">Mã</th>
                  <th className="text-left">Mô tả</th>
                  <th className="text-right">SL</th>
                  <th className="text-right">Đơn giá</th>
                  <th className="text-right">CK%</th>
                  <th className="text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l, i) => (
                  <tr key={l.id ?? i} className="border-b border-line/40 last:border-0">
                    <td className="py-1.5 font-mono text-flame">{l.part ?? l.torch ?? '—'}</td>
                    <td>{l.description}</td>
                    <td className="text-right tabular-nums">{l.qty}</td>
                    <td className="text-right tabular-nums">{formatVnd(l.unit_price)}</td>
                    <td className="text-right tabular-nums">{Number(l.discount_pct) > 0 ? `${l.discount_pct}%` : '—'}</td>
                    <td className="text-right tabular-nums">{formatVnd(l.line_total)}</td>
                  </tr>
                ))}
                {o.lines.length === 0 && (
                  <tr><td colSpan={6} className="py-3 text-center text-txt-2">Không có dòng nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end items-baseline gap-2 border-t border-line pt-3">
            <span className="text-txt-2 text-sm">Tổng giá trị:</span>
            <span className="font-bold text-flame tabular-nums text-base">{formatVnd(o.total_vnd)}</span>
          </div>

          {o.notes && (
            <div>
              <div className="text-xs text-txt-2 mb-1">Ghi chú</div>
              <p className="text-sm bg-ink-3 rounded-md px-3 py-2 whitespace-pre-wrap">{o.notes}</p>
            </div>
          )}
        </div>
      )}
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
