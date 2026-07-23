/**
 * Tokinarc frontend — src/pages/wms/Outbound.tsx
 * Đơn xuất kho THẬT (GET /wms/outbound/) + xem pick-list (GET .../pick-list/)
 * + giao hàng (POST .../ship/ → trừ tồn, ghi movement).
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { PackageCheck, Truck, ClipboardList, Plus, ScanLine, Eye, Download } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { downloadFile } from '@/lib/download'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { useDebounced } from '@/lib/useDebounced'
import {
  OUTBOUND_STATUS_LABEL, OUTBOUND_STATUS_TONE, RULE_LABEL,
  OUTBOUND_PURPOSE_LABEL, OUTBOUND_PURPOSE_TONE,
} from '@/lib/wms'
import type { OutboundOrder, OutboundStatus, OutboundPurpose } from '@/lib/types'
import {
  PageHeader, SearchInput, Tag, Button, TableCard, Th, Td, RowMsg, Pagination,
} from '@/components/ui'
import { Modal } from '@/components/Modal'
import { OutboundForm } from '@/pages/wms/forms/OutboundForm'
import { ScanOrderModal } from '@/pages/wms/ScanOrderModal'
import { OrderLinesModal } from '@/pages/wms/OrderLinesModal'

interface Pick { id: string; bin_code: string; qty: number; is_picked: boolean; serial: string | null }

const OUTBOUND_STATUSES: (OutboundStatus | '')[] = ['', 'draft', 'picking', 'picked', 'partial', 'shipped', 'cancelled']
const OUTBOUND_PURPOSES: (OutboundPurpose | '')[] = ['', 'sale', 'project']

export function OutboundPage() {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [pickFor, setPickFor] = useState<OutboundOrder | null>(null)
  const [picks, setPicks] = useState<Pick[] | null>(null)
  const [scanId, setScanId] = useState<string | null>(null)
  const [viewOrder, setViewOrder] = useState<OutboundOrder | null>(null)
  const [rejectFor, setRejectFor] = useState<OutboundOrder | null>(null)   // phiếu đang từ chối
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<OutboundStatus | ''>('')
  const [purpose, setPurpose] = useState<OutboundPurpose | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const debounced = useDebounced(search, 350, () => setPage(1))

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['wms-outbound-list', debounced, status, purpose, page, pageSize],
    queryFn: () => fetchPage<OutboundOrder>('/wms/outbound/', {
      search: debounced || undefined, status: status || undefined, purpose: purpose || undefined,
      page, page_size: pageSize,
    }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1

  const ship = useMutation({
    mutationFn: (id: string) => api.post(`/wms/outbound/${id}/ship/`),
    onSuccess: () => {
      toast.success('Đã giao hàng — trừ tồn kho')
      qc.invalidateQueries({ queryKey: ['wms-outbound-list'] })
      qc.invalidateQueries({ queryKey: ['wms'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post(`/wms/outbound/${v.id}/reject/`, { reason: v.reason }),
    onSuccess: () => {
      toast.success('Đã từ chối phiếu — đơn trả về sale xử lý')
      qc.invalidateQueries({ queryKey: ['wms-outbound-list'] })
      qc.invalidateQueries({ queryKey: ['wms'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const viewPicks = useMutation({
    mutationFn: (o: OutboundOrder) => api.get<Pick[]>(`/wms/outbound/${o.id}/pick-list/`),
    onSuccess: (res, o) => { setPickFor(o); setPicks(res.data) },
    onError: (e) => toast.error(apiError(e)),
  })

  const items = data?.results ?? []

  return (
    <div className="max-w-5xl">
      <PageHeader icon={<PackageCheck size={20} className="text-flame" />} title="Xuất kho"
        subtitle={data ? `${data.count} đơn xuất` : undefined}
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Tìm mã đơn, khách hàng…" />
            <select value={purpose} onChange={(e) => { setPurpose(e.target.value as OutboundPurpose | ''); setPage(1) }}
              className="bg-ink-2 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame">
              <option value="">Tất cả mục đích</option>
              {OUTBOUND_PURPOSES.filter(Boolean).map((p) => <option key={p} value={p}>{OUTBOUND_PURPOSE_LABEL[p as OutboundPurpose]}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value as OutboundStatus | ''); setPage(1) }}
              className="bg-ink-2 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame">
              {OUTBOUND_STATUSES.map((s) => <option key={s} value={s}>{s ? OUTBOUND_STATUS_LABEL[s] : 'Tất cả trạng thái'}</option>)}
            </select>
            <Button onClick={() => setFormOpen(true)}><Plus size={14} /> Tạo đơn xuất</Button>
          </>
        } />

      <TableCard>
        <thead>
          <tr className="border-b border-line">
            <Th>Mã đơn</Th><Th>Rule</Th><Th>Mục đích</Th><Th className="text-right">Số dòng</Th>
            <Th>Trạng thái</Th><Th className="text-right">Hành động</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <RowMsg colSpan={6}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={6} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data && items.length === 0 && <RowMsg colSpan={6}>Chưa có đơn xuất.</RowMsg>}
          {items.map((o) => (
            <tr key={o.id} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
              <Td className="font-mono text-flame">{o.code}</Td>
              <Td className="text-txt-2">{o.rule}</Td>
              <Td><Tag tone={OUTBOUND_PURPOSE_TONE[o.purpose]}>{OUTBOUND_PURPOSE_LABEL[o.purpose]}</Tag></Td>
              <Td className="text-right tabular-nums">{o.lines?.length ?? 0}</Td>
              <Td><Tag tone={OUTBOUND_STATUS_TONE[o.status]}>{OUTBOUND_STATUS_LABEL[o.status]}</Tag></Td>
              <Td className="text-right whitespace-nowrap">
                <Button variant="ghost" size="sm" className="mr-1.5" onClick={() => setViewOrder(o)}>
                  <Eye size={13} /> Xem
                </Button>
                <Button variant="ghost" size="sm" className="mr-1.5"
                  onClick={() => downloadFile(`/wms/outbound/${o.id}/export-xlsx/`, `phieu_xuat_${o.code}.xlsx`)}>
                  <Download size={13} /> Excel
                </Button>
                <Button variant="ghost" size="sm" className="mr-1.5"
                  disabled={viewPicks.isPending} onClick={() => viewPicks.mutate(o)}>
                  <ClipboardList size={13} /> Pick-list
                </Button>
                {o.status !== 'shipped' && o.status !== 'cancelled' && (
                  <Button variant="ghost" size="sm" className="mr-1.5" onClick={() => setScanId(o.id)}>
                    <ScanLine size={13} /> Quét
                  </Button>
                )}
                {o.status !== 'shipped' && o.status !== 'cancelled' && (
                  <Button variant="ghost" size="sm" className="mr-1.5"
                    disabled={reject.isPending && reject.variables?.id === o.id}
                    onClick={() => { setReason(''); setRejectFor(o) }}>
                    Từ chối
                  </Button>
                )}
                {(o.status === 'picking' || o.status === 'picked' || o.status === 'partial') && (
                  <Button size="sm" disabled={ship.isPending && ship.variables === o.id}
                    onClick={() => ship.mutate(o.id)}>
                    <Truck size={13} /> {o.status === 'partial' ? 'Giao tiếp' : 'Giao'}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      {data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      <OutboundForm open={formOpen} onClose={() => setFormOpen(false)} />
      <ScanOrderModal open={!!scanId} onClose={() => setScanId(null)} kind="outbound" orderId={scanId} />
      <OrderLinesModal
        open={!!viewOrder} onClose={() => setViewOrder(null)}
        title={`Phiếu xuất ${viewOrder?.code ?? ''}`}
        meta={viewOrder && (
          <div className="text-sm text-txt-2 flex gap-4">
            <span>Trạng thái: <Tag tone={OUTBOUND_STATUS_TONE[viewOrder.status]}>{OUTBOUND_STATUS_LABEL[viewOrder.status]}</Tag></span>
            {viewOrder.sales_order_code && <span>Đơn bán: <span className="font-mono">{viewOrder.sales_order_code}</span></span>}
          </div>
        )}
        q1Label="SL đặt" q2Label="Đã soạn" showPrice
        lines={(viewOrder?.lines ?? []).map((l, i) => ({
          key: l.id ?? String(i), name: l.part_name ?? '', code: l.part ?? l.torch ?? '—',
          q1: l.qty_ordered, q2: l.qty_picked,
          unitPrice: l.unit_price, lineTotal: l.line_total,
        }))}
      />

      <Modal open={!!pickFor} onClose={() => setPickFor(null)}
        title={`Pick-list — ${pickFor?.code ?? ''}`}
        icon={<ClipboardList size={18} className="text-flame" />}>
        <p className="text-xs text-txt-2 mb-3">Rule: {pickFor && RULE_LABEL[pickFor.rule]}</p>
        {picks && picks.length === 0 && <p className="text-sm text-txt-2">Không phân được bin (có thể thiếu tồn).</p>}
        {picks && picks.length > 0 && (
          <div className="space-y-2">
            {picks.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border border-line rounded-md px-3 py-2 text-sm">
                <span className="font-mono text-flame">{p.bin_code}</span>
                <span className="flex-1">{p.serial ? `Serial ${p.serial}` : `SL ${p.qty}`}</span>
                {p.is_picked ? <Tag tone="ok">đã soạn</Tag> : <Tag tone="warn">chờ soạn</Tag>}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal từ chối phiếu xuất — nhập lý do */}
      <Modal open={!!rejectFor} onClose={() => setRejectFor(null)}
        title={`Từ chối phiếu xuất — ${rejectFor?.code ?? ''}`}
        icon={<PackageCheck size={18} className="text-flame" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectFor(null)}>Hủy</Button>
            <Button variant="danger" disabled={reject.isPending}
              onClick={() => rejectFor && reject.mutate(
                { id: rejectFor.id, reason },
                { onSuccess: () => setRejectFor(null) })}>
              {reject.isPending ? 'Đang xử lý…' : 'Xác nhận từ chối'}
            </Button>
          </>
        }>
        <div className="space-y-2">
          <p className="text-sm text-txt-2">Phiếu bị từ chối sẽ <b>trả về sale xử lý</b>; không trừ tồn.</p>
          <label className="block text-[11px] uppercase tracking-wide text-txt-2 font-semibold">Lý do từ chối</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            placeholder="VD: Hết hàng / hàng lỗi / sai đơn / khách hoãn nhận…"
            className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm focus:border-flame focus:outline-none" />
        </div>
      </Modal>
    </div>
  )
}
