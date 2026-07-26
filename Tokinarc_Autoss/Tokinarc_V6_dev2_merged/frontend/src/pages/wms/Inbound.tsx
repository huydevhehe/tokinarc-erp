/**
 * Tokinarc frontend — src/pages/wms/Inbound.tsx
 * Đơn nhập kho THẬT (GET /wms/inbound/) + xác nhận nhận hàng
 * (POST /wms/inbound/{id}/confirm/ → cộng tồn theo từng line).
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { PackageCheck, Check, Plus, ScanLine, Eye, Pencil, Trash2, CalendarClock, Undo2, PackageMinus } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { downloadFile } from '@/lib/download'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { useDebounced } from '@/lib/useDebounced'
import { formatDate, compactVnd } from '@/lib/crm'
import { INBOUND_STATUS_LABEL, INBOUND_STATUS_TONE, DATE_QUICK_RANGES } from '@/lib/wms'
import type { InboundFlowType, InboundOrder, InboundStatus } from '@/lib/types'
import {
  PageHeader, SearchInput, Tag, Button, Card, TableCard, Th, Td, RowMsg, Pagination,
} from '@/components/ui'
import { InboundForm } from '@/pages/wms/forms/InboundForm'
import { ScanOrderModal } from '@/pages/wms/ScanOrderModal'
import { OrderLinesModal } from '@/pages/wms/OrderLinesModal'
import { Modal } from '@/components/Modal'

const INBOUND_STATUSES: (InboundStatus | '')[] = ['', 'draft', 'partial', 'putaway', 'cancelled']

export function InboundPage() {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [scanId, setScanId] = useState<string | null>(null)
  const [viewOrder, setViewOrder] = useState<InboundOrder | null>(null)
  const [partialFor, setPartialFor] = useState<InboundOrder | null>(null)   // phiếu đang nhận một phần
  const [reason, setReason] = useState('')
  const [fullFor, setFullFor] = useState<InboundOrder | null>(null)   // xác nhận nhận đủ khi chưa quét
  const [editOrder, setEditOrder] = useState<InboundOrder | null>(null)   // sửa phiếu Nháp
  const [dateEditFor, setDateEditFor] = useState<InboundOrder | null>(null)   // sửa Ngày nhập kho
  const [newReceivedAt, setNewReceivedAt] = useState('')
  const [flowTab, setFlowTab] = useState<InboundFlowType>('internal')   // 2 tab song song: Nội bộ / Nhà cung cấp
  const [status, setStatus] = useState<InboundStatus | ''>('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const debounced = useDebounced(search, 350, () => setPage(1))

  const applyQuick = (key: keyof typeof DATE_QUICK_RANGES) => {
    const [from, to] = DATE_QUICK_RANGES[key]()
    setDateFrom(from); setDateTo(to); setPage(1)
  }

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['wms-inbound-list', flowTab, debounced, status, dateFrom, dateTo, page, pageSize],
    queryFn: () => fetchPage<InboundOrder>('/wms/inbound/', {
      flow_type: flowTab, search: debounced || undefined, status: status || undefined,
      received_at__gte: dateFrom || undefined, received_at__lte: dateTo ? `${dateTo}T23:59:59` : undefined,
      page, page_size: pageSize,
    }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1

  const confirm = useMutation({
    mutationFn: (v: { id: string; partial?: boolean; shortage_note?: string }) =>
      api.post(`/wms/inbound/${v.id}/confirm/`, { partial: !!v.partial, shortage_note: v.shortage_note ?? '' }),
    onSuccess: (r) => {
      toast.success(r.data?.status === 'partial'
        ? 'Đã nhận một phần — phiếu còn mở, nhận tiếp khi hàng về'
        : 'Đã xác nhận nhận hàng — tồn kho đã cộng')
      qc.invalidateQueries({ queryKey: ['wms-inbound-list'] })
      qc.invalidateQueries({ queryKey: ['wms'] })
      qc.invalidateQueries({ queryKey: ['wms-inventory'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const editDate = useMutation({
    // Chỉ sửa ngày nhận (received_at) — KHÔNG đụng SL/đơn giá dòng hàng, nên
    // an toàn ở mọi trạng thái đã nhận (tồn kho đã cộng không bị ảnh hưởng).
    mutationFn: (v: { id: string; received_at: string }) =>
      api.patch(`/wms/inbound/${v.id}/`, { received_at: v.received_at }),
    onSuccess: () => {
      toast.success('Đã cập nhật ngày nhập kho')
      qc.invalidateQueries({ queryKey: ['wms-inbound-list'] })
      setDateEditFor(null)
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const remove = useMutation({
    // "Xóa" = ẩn (is_active=false), giống NCC/Sản phẩm — không xóa cứng phiếu
    // vì đây là chứng từ đối chiếu tồn kho.
    mutationFn: (id: string) => api.patch(`/wms/inbound/${id}/`, { is_active: false }),
    onSuccess: () => {
      toast.success('Đã xóa phiếu nhập')
      qc.invalidateQueries({ queryKey: ['wms-inbound-list'] })
      qc.invalidateQueries({ queryKey: ['wms'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const restore = useMutation({
    // Lỡ xóa (is_active=false) thì khôi phục lại — chỉ đổi trạng thái hiển thị,
    // không đụng gì đến tồn kho/lịch sử.
    mutationFn: (id: string) => api.patch(`/wms/inbound/${id}/`, { is_active: true }),
    onSuccess: () => {
      toast.success('Đã khôi phục phiếu nhập')
      qc.invalidateQueries({ queryKey: ['wms-inbound-list'] })
      qc.invalidateQueries({ queryKey: ['wms'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const items = data?.results ?? []

  return (
    <div className="max-w-7xl">
      <PageHeader icon={<PackageCheck size={20} className="text-flame" />} title="Nhập kho"
        subtitle={data ? `${data.count} đơn nhập` : undefined}
        actions={<Button onClick={() => setFormOpen(true)}><Plus size={14} /> Tạo đơn nhập</Button>} />

      <div className="flex gap-1.5 mb-3">
        <button onClick={() => { setFlowTab('internal'); setPage(1) }}
          className={`text-xs rounded-md px-3 py-1.5 border transition-colors ${flowTab === 'internal' ? 'border-flame text-flame bg-flame/10' : 'border-line text-txt-2 hover:text-txt'}`}>
          Nội bộ
        </button>
        <button onClick={() => { setFlowTab('supplier'); setPage(1) }}
          className={`text-xs rounded-md px-3 py-1.5 border transition-colors ${flowTab === 'supplier' ? 'border-flame text-flame bg-flame/10' : 'border-line text-txt-2 hover:text-txt'}`}>
          Nhà cung cấp (NCC)
        </button>
      </div>

      <Card className="mb-4 !p-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Tìm mã đơn, NCC, mã đơn mua…" />
        <select value={status} onChange={(e) => { setStatus(e.target.value as InboundStatus | ''); setPage(1) }}
          className="bg-ink-3 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame">
          {INBOUND_STATUSES.map((s) => <option key={s} value={s}>{s ? INBOUND_STATUS_LABEL[s] : 'Tất cả trạng thái'}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="bg-ink-3 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame" />
          <span className="text-txt-2 text-sm">–</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="bg-ink-3 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame" />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => applyQuick('month')}>Tháng này</Button>
          <Button variant="ghost" size="sm" onClick={() => applyQuick('quarter')}>Quý này</Button>
          <Button variant="ghost" size="sm" onClick={() => applyQuick('year')}>Năm nay</Button>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}>
              Bỏ lọc ngày
            </Button>
          )}
        </div>
      </Card>

      <TableCard>
        <thead>
          <tr className="border-b border-line">
            <Th>Mã đơn</Th><Th>Ngày nhập</Th><Th>Nhà CC</Th><Th>Mặt hàng</Th>
            <Th className="text-right">SL</Th><Th className="text-right">Thành tiền</Th>
            <Th>Trạng thái</Th><Th className="text-right">Hành động</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <RowMsg colSpan={8}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={8} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data && items.length === 0 && <RowMsg colSpan={8}>Chưa có đơn nhập.</RowMsg>}
          {items.map((o) => {
            const lines = o.lines ?? []
            const exp = lines.reduce((s, l) => s + (l.qty_expected || 0), 0)
            const amount = lines.reduce((s, l) => s + (l.qty_expected || 0) * Number(l.unit_cost || 0), 0)
            const itemLabel = lines.length === 1 ? (lines[0].part_name || '—')
              : lines.length > 1 ? `${lines.length} mặt hàng` : '—'
            return (
            <tr key={o.id} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
              <Td className="font-mono text-flame">{o.code}</Td>
              <Td className="text-txt-2">{formatDate(o.received_at)}</Td>
              <Td className="text-txt-2">{o.supplier || '—'}</Td>
              <Td className="text-txt-2 truncate max-w-[220px]">{itemLabel}</Td>
              <Td className="text-right tabular-nums">{exp}</Td>
              <Td className="text-right tabular-nums whitespace-nowrap">{compactVnd(amount)}</Td>
              <Td><Tag tone={INBOUND_STATUS_TONE[o.status]}>{INBOUND_STATUS_LABEL[o.status]}</Tag></Td>
              <Td className="text-right">
                <span className="inline-flex gap-1 items-center">
                <Button variant="ghost" size="sm" className="!px-2" title="Xem" onClick={() => setViewOrder(o)}>
                  <Eye size={13} />
                </Button>
                {!o.is_active && (
                  <Button variant="ghost" size="sm" className="!px-2" title="Khôi phục"
                    disabled={restore.isPending && restore.variables === o.id}
                    onClick={() => restore.mutate(o.id)}>
                    <Undo2 size={13} />
                  </Button>
                )}
                {o.is_active && o.status === 'draft' && (
                  <Button variant="ghost" size="sm" className="!px-2" title="Sửa" onClick={() => setEditOrder(o)}>
                    <Pencil size={13} />
                  </Button>
                )}
                {o.is_active && o.received_at && (
                  <Button variant="ghost" size="sm" className="!px-2" title="Sửa ngày nhập kho"
                    onClick={() => { setNewReceivedAt(o.received_at!.slice(0, 10)); setDateEditFor(o) }}>
                    <CalendarClock size={13} />
                  </Button>
                )}
                {o.is_active && (
                  <Button variant="ghost" size="sm" className="!px-2 !text-danger" title="Xóa"
                    disabled={remove.isPending && remove.variables === o.id}
                    onClick={() => {
                      if (window.confirm(`Xóa phiếu nhập "${o.code}"? Phiếu sẽ ẩn khỏi danh sách (tồn kho/lịch sử vẫn giữ nguyên).`)) remove.mutate(o.id)
                    }}>
                    <Trash2 size={13} />
                  </Button>
                )}
                {o.is_active && (o.status === 'draft' || o.status === 'confirmed' || o.status === 'partial') ? (
                  <span className="inline-flex gap-1">
                    <Button variant="ghost" size="sm" className="!px-2" title="Quét mã" onClick={() => setScanId(o.id)}>
                      <ScanLine size={13} />
                    </Button>
                    <Button variant="ghost" size="sm" className="!px-2" title="Nhận một phần"
                      disabled={confirm.isPending && confirm.variables?.id === o.id}
                      onClick={() => { setReason(o.shortage_note ?? ''); setPartialFor(o) }}>
                      <PackageMinus size={13} />
                    </Button>
                    <Button variant="success" size="sm" className="!px-2" title="Nhận đủ"
                      disabled={confirm.isPending && confirm.variables?.id === o.id}
                      onClick={() => {
                        const scanned = (o.lines ?? []).some((l) => (l.qty_received ?? 0) > 0)
                        if (scanned) confirm.mutate({ id: o.id })   // đã quét → nhận thẳng
                        else setFullFor(o)                          // chưa quét → hỏi xác nhận
                      }}>
                      <Check size={13} />
                    </Button>
                  </span>
                ) : null}
                </span>
              </Td>
            </tr>
          )})}
        </tbody>
      </TableCard>

      {data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      <InboundForm open={formOpen || !!editOrder} editing={editOrder}
        onClose={() => { setFormOpen(false); setEditOrder(null) }} />
      <ScanOrderModal open={!!scanId} onClose={() => setScanId(null)} kind="inbound" orderId={scanId} />
      <OrderLinesModal
        open={!!viewOrder} onClose={() => setViewOrder(null)}
        title={`Phiếu nhập ${viewOrder?.code ?? ''}`}
        onExport={() => viewOrder && downloadFile(`/wms/inbound/${viewOrder.id}/export-xlsx/`, `phieu_nhap_${viewOrder.code}.xlsx`)}
        meta={viewOrder && (
          <div className="text-sm text-txt-2 space-y-1.5">
            <div>
              Trạng thái: <Tag tone={INBOUND_STATUS_TONE[viewOrder.status]}>{INBOUND_STATUS_LABEL[viewOrder.status]}</Tag>
              {viewOrder.po_code && <span className="ml-3">Từ đơn mua: <b className="text-txt font-mono">{viewOrder.po_code}</b></span>}
              <span className="ml-3">Loại: <b className="text-txt">{viewOrder.flow_type === 'supplier' ? 'Nhà cung cấp' : 'Nội bộ'}</b></span>
              {viewOrder.supplier && <span className="ml-3">Nhà cung cấp: <b className="text-txt">{viewOrder.supplier}</b></span>}
            </div>
            <div>
              Ngày nhập kho: <b className="text-txt">{formatDate(viewOrder.received_at)}</b>
              {viewOrder.invoice_date && <span className="ml-3">Ngày xuất hóa đơn: <b className="text-txt">{formatDate(viewOrder.invoice_date)}</b></span>}
              {viewOrder.invoice_no && <span className="ml-3">Số hóa đơn: <b className="text-txt">{viewOrder.invoice_no}</b></span>}
            </div>
            <div>
              {viewOrder.delivered_by_name && <span>Người giao: <b className="text-txt">{viewOrder.delivered_by_name}</b></span>}
              {viewOrder.received_by_username && <span className="ml-3">Người nhận: <b className="text-txt">{viewOrder.received_by_username}</b></span>}
            </div>
            {viewOrder.shortage_note && (
              <div className="bg-danger/10 border border-danger/30 rounded-md px-3 py-2 text-txt">
                <b className="text-danger">Lý do nhận thiếu:</b> {viewOrder.shortage_note}
              </div>
            )}
          </div>
        )}
        q1Label="SL dự kiến" q2Label="Đã nhận" showPrice showTax
        lines={(viewOrder?.lines ?? []).map((l, i) => ({
          key: l.id ?? String(i), name: l.part_name ?? '', code: l.part ?? l.torch ?? '—',
          unit: l.unit, q1: l.qty_expected, q2: l.qty_received,
          unitPrice: l.unit_cost != null ? String(l.unit_cost) : null,
          lineTotal: l.unit_cost != null ? String(Number(l.unit_cost) * l.qty_received) : null,
          taxPct: l.tax_pct,
        }))}
      />

      {/* Modal nhận một phần — nhập lý do thiếu */}
      <Modal open={!!partialFor} onClose={() => setPartialFor(null)}
        title={`Nhận một phần — ${partialFor?.code ?? ''}`}
        icon={<PackageCheck size={18} className="text-flame" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPartialFor(null)}>Hủy</Button>
            <Button disabled={confirm.isPending}
              onClick={() => partialFor && confirm.mutate(
                { id: partialFor.id, partial: true, shortage_note: reason },
                { onSuccess: () => setPartialFor(null) })}>
              {confirm.isPending ? 'Đang lưu…' : 'Xác nhận nhận một phần'}
            </Button>
          </>
        }>
        <div className="space-y-2">
          <p className="text-sm text-txt-2">
            Cộng tồn phần đã quét/nhận; phần còn thiếu giữ phiếu <b>mở</b> để nhận tiếp khi hàng về.
          </p>
          <label className="block text-[11px] uppercase tracking-wide text-txt-2 font-semibold">Lý do nhận thiếu</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            placeholder="VD: NCC giao thiếu 20 cái, hẹn giao bù tuần sau / hàng lỗi 2 cái…"
            className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm focus:border-flame focus:outline-none" />
        </div>
      </Modal>

      {/* Xác nhận "Nhận đủ" khi CHƯA quét món nào */}
      <Modal open={!!fullFor} onClose={() => setFullFor(null)}
        title={`Nhận đủ — ${fullFor?.code ?? ''}`}
        icon={<Check size={18} className="text-flame" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFullFor(null)}>Hủy</Button>
            <Button variant="success" disabled={confirm.isPending}
              onClick={() => fullFor && confirm.mutate({ id: fullFor.id },
                { onSuccess: () => setFullFor(null) })}>
              {confirm.isPending ? 'Đang lưu…' : 'Vẫn nhận đủ'}
            </Button>
          </>
        }>
        <p className="text-sm text-txt">
          Bạn <b className="text-warn">chưa quét/nhận món nào</b>. Nếu xác nhận, hệ thống coi như
          nhận <b>ĐỦ theo số lượng đặt</b> mà không kiểm tra thực tế. Nên <b>Quét</b> từng món
          trước để đối chiếu.
        </p>
      </Modal>

      {/* Sửa Ngày nhập kho — chỉ đổi received_at, không đụng SL/đơn giá dòng hàng */}
      <Modal open={!!dateEditFor} onClose={() => setDateEditFor(null)}
        title={`Sửa ngày nhập kho — ${dateEditFor?.code ?? ''}`}
        icon={<CalendarClock size={18} className="text-flame" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDateEditFor(null)}>Hủy</Button>
            <Button disabled={editDate.isPending || !newReceivedAt}
              onClick={() => dateEditFor && editDate.mutate({ id: dateEditFor.id, received_at: newReceivedAt })}>
              {editDate.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </>
        }>
        <label className="block text-[11px] uppercase tracking-wide text-txt-2 font-semibold mb-1">Ngày nhập kho</label>
        <input type="date" value={newReceivedAt} onChange={(e) => setNewReceivedAt(e.target.value)} autoFocus
          className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm focus:border-flame focus:outline-none" />
      </Modal>
    </div>
  )
}
