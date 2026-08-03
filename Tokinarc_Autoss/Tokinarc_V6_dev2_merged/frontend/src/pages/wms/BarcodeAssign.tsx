/**
 * Tokinarc frontend — src/pages/wms/BarcodeAssign.tsx
 * Gán mã vạch/QR cho sản phẩm.
 *   Tab "Quét & Gán": quét bằng camera HOẶC tải ảnh lên → tìm mã trong danh
 *     mục; mã lạ (chưa gán) → tìm & chọn đúng sản phẩm để gán 1 lần, từ đó
 *     quét lại tem đó luôn tự nhận ra sản phẩm.
 *   Tab "Danh sách đã gán": xem/thêm/sửa/xóa toàn bộ mã đã gán — set-barcode
 *     ở tab kia chỉ TẠO, không cho sửa/xóa khi gán nhầm.
 * (Tách riêng khỏi "Kiểm kê" 2026-07-28 — kiểm kê là đối chiếu tồn kho thực
 * tế, không phải nơi khai báo/gán mã cho danh mục sản phẩm.)
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Barcode, Search, Link2, ScanLine, List, Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { useAuth, isWmsControl } from '@/lib/auth/store'
import { CameraScanner, type ScanKind } from '@/components/CameraScanner'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Modal } from '@/components/Modal'
import { usePartOptions } from '@/lib/useWmsOptions'
import type { CatalogPart, SerialNumber } from '@/lib/types'
import { PageHeader, Card, Button, Tag, TableCard, Th, Td, RowMsg, Pagination } from '@/components/ui'

interface PartBarcodeRow { id: number; part: string; part_name: string; code: string; created_at: string }

export function BarcodeAssignPage() {
  const qc = useQueryClient()
  const canManage = isWmsControl(useAuth((s) => s.user?.role))
  const [tab, setTab] = useState<'scan' | 'list'>('scan')
  const [lookupQ, setLookupQ] = useState('')
  const [lookupKind, setLookupKind] = useState<ScanKind | null>(null)   // biết được nhờ quét (camera/ảnh) — gõ tay thì không biết loại
  const [assigning, setAssigning] = useState(false)   // quét-gán: mã lạ → gán cho 1 SP
  const [assignPick, setAssignPick] = useState('')
  const [hasExtraCode, setHasExtraCode] = useState(false)   // tick "có kèm mã Barcode/QR khác không"
  const [extraCode, setExtraCode] = useState('')
  const [scanningExtra, setScanningExtra] = useState(false)   // đang mở camera quét mã kèm theo (thay vì gõ tay)
  const { options: partOptions, isLoading: partsLoading } = usePartOptions()

  // Sản phẩm đang chọn để gán đã có sẵn mã nào chưa (để hiện thông tin, không
  // bắt gõ lại nếu đã có sẵn mã loại kia rồi).
  const existingCodes = useQuery({
    queryKey: ['part-barcodes-for', assignPick],
    queryFn: () => api.get<{ results: PartBarcodeRow[] }>('/catalog/part-barcodes/', { params: { search: assignPick } })
      .then((r) => r.data.results.filter((row) => row.part === assignPick)),
    enabled: assigning && !!assignPick,
  })

  // Quét/nhập mã → tìm phụ tùng (catalog, có cả barcode) + serial (WMS).
  const lookup = useQuery({
    queryKey: ['scan-lookup', lookupQ],
    queryFn: async () => {
      const [parts, serials] = await Promise.all([
        api.get<{ results: CatalogPart[] }>('/catalog/parts/', { params: { search: lookupQ.trim() } }),
        api.get<{ results: SerialNumber[] }>('/wms/serials/', { params: { search: lookupQ.trim() } }),
      ])
      return { parts: parts.data.results.slice(0, 6), serials: serials.data.results.slice(0, 6) }
    },
    enabled: tab === 'scan' && lookupQ.trim().length >= 2,
  })

  const assignMut = useMutation({
    mutationFn: async (partNo: string) => {
      const r = await api.post(`/catalog/parts/${encodeURIComponent(partNo)}/set-barcode/`, { barcode: lookupQ.trim() })
      if (hasExtraCode && extraCode.trim()) {
        await api.post(`/catalog/parts/${encodeURIComponent(partNo)}/set-barcode/`, { barcode: extraCode.trim() })
      }
      return r
    },
    onSuccess: (r) => {
      const extra = hasExtraCode && extraCode.trim() ? ` + "${extraCode.trim()}"` : ''
      toast.success(`Đã gán "${lookupQ.trim()}"${extra} → ${r.data.part_no}. Lần sau quét ra ngay.`)
      setAssigning(false); setAssignPick(''); setHasExtraCode(false); setExtraCode('')
      qc.invalidateQueries({ queryKey: ['scan-lookup'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  // ─── Tab "Danh sách đã gán" ────────────────────────────────────────────
  const [listSearch, setListSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [editing, setEditing] = useState<PartBarcodeRow | null>(null)   // null=đóng, {}=thêm mới
  const [addOpen, setAddOpen] = useState(false)
  const [formCode, setFormCode] = useState('')
  const [formPart, setFormPart] = useState('')

  const list = useQuery({
    queryKey: ['part-barcodes', listSearch, page, pageSize],
    queryFn: () => fetchPage<PartBarcodeRow>('/catalog/part-barcodes/', { search: listSearch || undefined, page, page_size: pageSize }),
    enabled: tab === 'list',
  })
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.count / pageSize)) : 1

  const save = useMutation({
    mutationFn: () => editing
      ? api.patch(`/catalog/part-barcodes/${editing.id}/`, { part: formPart, code: formCode })
      : api.post('/catalog/part-barcodes/', { part: formPart, code: formCode }),
    onSuccess: () => {
      toast.success(editing ? 'Đã lưu' : 'Đã thêm mã mới')
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
      setAddOpen(false); setEditing(null); setFormCode(''); setFormPart('')
    },
    onError: (e) => toast.error(apiError(e)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/catalog/part-barcodes/${id}/`),
    onSuccess: () => { toast.success('Đã xóa'); qc.invalidateQueries({ queryKey: ['part-barcodes'] }) },
    onError: (e) => toast.error(apiError(e)),
  })

  const openAdd = () => { setEditing(null); setFormCode(''); setFormPart(''); setAddOpen(true) }
  const openEdit = (row: PartBarcodeRow) => { setEditing(row); setFormCode(row.code); setFormPart(row.part); setAddOpen(true) }

  return (
    <div className={tab === 'scan' ? 'max-w-xl' : 'max-w-3xl'}>
      <PageHeader icon={<Barcode size={20} className="text-flame" />} title="Gán mã vạch/QR"
        subtitle={tab === 'scan'
          ? 'Quét hoặc tải ảnh lên → tìm sản phẩm. Mã lạ (chưa gán) → chọn đúng sản phẩm, gán 1 lần.'
          : 'Toàn bộ mã đã gán — sửa/xóa nếu gán nhầm.'}
        actions={tab === 'list' && canManage
          ? <Button onClick={openAdd}><Plus size={14} /> Thêm mã</Button> : undefined} />

      <div className="flex gap-1.5 mb-4">
        <button onClick={() => setTab('scan')}
          className={`flex items-center gap-1.5 text-sm rounded-md px-3 py-1.5 border transition-colors ${tab === 'scan' ? 'border-flame text-flame bg-flame/10' : 'border-line text-txt-2 hover:text-txt'}`}>
          <ScanLine size={14} /> Quét & Gán
        </button>
        <button onClick={() => setTab('list')}
          className={`flex items-center gap-1.5 text-sm rounded-md px-3 py-1.5 border transition-colors ${tab === 'list' ? 'border-flame text-flame bg-flame/10' : 'border-line text-txt-2 hover:text-txt'}`}>
          <List size={14} /> Danh sách đã gán
        </button>
      </div>

      {tab === 'scan' && (
      <div className="space-y-3">
        <CameraScanner onScan={(c, k) => { setLookupQ(c); setLookupKind(k) }} />
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-2" />
          <input value={lookupQ} onChange={(e) => { setLookupQ(e.target.value); setLookupKind(null) }}
            placeholder="Quét, tải ảnh, hoặc nhập mã hàng / serial…"
            className="w-full bg-ink-3 border border-line rounded-md pl-9 pr-3 py-2 text-sm focus:border-flame focus:outline-none" />
        </div>
        {lookup.isLoading && <p className="text-xs text-txt-2">Đang tìm…</p>}
        {lookup.data && lookup.data.parts.length === 0 && lookup.data.serials.length === 0 && lookupQ.trim().length >= 2 && (
          <Card>
            <p className="text-sm text-txt-2 mb-2">
              Không tìm thấy "<span className="font-mono text-flame">{lookupQ.trim()}</span>". Tem này có thể <b>chưa gán</b>.
            </p>
            {!assigning ? (
              <Button size="sm" onClick={() => setAssigning(true)}>
                <Link2 size={14} /> Gán mã này cho sản phẩm
              </Button>
            ) : (
              <div className="space-y-2">
                {lookupKind && (
                  <label className="flex items-center gap-1.5 text-[11px] text-txt-2">
                    <input type="checkbox" checked={hasExtraCode}
                      onChange={(e) => {
                        setHasExtraCode(e.target.checked)
                        if (!e.target.checked) { setExtraCode(''); setScanningExtra(false) }
                      }} />
                    Mã này có kèm {lookupKind === 'qr' ? 'Barcode' : 'QR'} riêng trên cùng tem/hộp không?
                  </label>
                )}
                {hasExtraCode && (
                  <div className="space-y-1.5">
                    {scanningExtra ? (
                      <CameraScanner onScan={(c) => { setExtraCode(c); setScanningExtra(false) }} />
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setScanningExtra(true)}>
                        <ScanLine size={13} /> Quét mã {lookupKind === 'qr' ? 'Barcode' : 'QR'} kèm theo
                      </Button>
                    )}
                    <input value={extraCode} onChange={(e) => setExtraCode(e.target.value)}
                      placeholder={`…hoặc gõ tay mã ${lookupKind === 'qr' ? 'Barcode' : 'QR'} nếu không quét được`}
                      className="w-full bg-ink-3 border border-line rounded-md px-3 py-1.5 text-xs font-mono focus:border-flame focus:outline-none" />
                    {extraCode && <p className="text-[11px] text-ok">✓ Mã kèm theo: <span className="font-mono">{extraCode}</span></p>}
                  </div>
                )}
                <p className="text-[11px] text-txt-2">Tìm & chọn sản phẩm để gán mã <span className="font-mono">{lookupQ.trim()}</span>:</p>
                <SearchableSelect
                  value={assignPick}
                  onChange={setAssignPick}
                  options={partOptions} loading={partsLoading}
                  placeholder="Gõ tên hoặc mã sản phẩm để tìm…" />
                {assignPick && !!existingCodes.data?.length && (
                  <p className="text-[11px] text-txt-2">
                    Sản phẩm này đã có sẵn mã: {existingCodes.data.map((row) => (
                      <span key={row.id} className="font-mono text-flame mr-1.5">{row.code}</span>
                    ))}
                  </p>
                )}
                {assignPick && (
                  <Button size="sm" disabled={assignMut.isPending} onClick={() => assignMut.mutate(assignPick)}>
                    <Link2 size={14} /> Gán
                  </Button>
                )}
                <button onClick={() => { setAssigning(false); setAssignPick(''); setHasExtraCode(false); setExtraCode('') }}
                  className="text-xs text-txt-2 hover:text-txt block">Hủy</button>
              </div>
            )}
          </Card>
        )}
        {(lookup.data?.parts ?? []).map((p) => (
          <Card key={p.tokin_part_no}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-flame">{p.tokin_part_no}</span>
              <span className="text-sm flex-1">{p.display_name_vi}</span>
              <span className="text-sm tabular-nums text-txt-2">{p.price_display}</span>
            </div>
          </Card>
        ))}
        {(lookup.data?.serials ?? []).map((s) => (
          <Card key={s.serial}>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-flame">{s.serial}</span>
              <span className="flex-1">{s.torch}</span>
              <Tag tone="gray">{s.status}</Tag>
            </div>
          </Card>
        ))}
      </div>
      )}

      {tab === 'list' && (
      <>
        <div className="relative mb-3 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-2" />
          <input value={listSearch} onChange={(e) => { setListSearch(e.target.value); setPage(1) }}
            placeholder="Tìm theo mã hoặc tên sản phẩm…"
            className="w-full bg-ink-3 border border-line rounded-md pl-9 pr-3 py-2 text-sm focus:border-flame focus:outline-none" />
        </div>
        <TableCard>
          <thead><tr className="border-b border-line">
            <Th>Mã đã gán</Th><Th>Sản phẩm</Th><Th>Ngày gán</Th>
            {canManage && <Th className="text-right">Hành động</Th>}
          </tr></thead>
          <tbody>
            {list.isLoading && <RowMsg colSpan={canManage ? 4 : 3}>Đang tải…</RowMsg>}
            {list.data?.results.length === 0 && <RowMsg colSpan={canManage ? 4 : 3}>Chưa gán mã nào.</RowMsg>}
            {list.data?.results.map((row) => (
              <tr key={row.id} className="border-b border-line/50 last:border-0">
                <Td className="font-mono text-flame">{row.code}</Td>
                <Td>{row.part} — {row.part_name}</Td>
                <Td className="text-txt-2 text-xs">{new Date(row.created_at).toLocaleDateString('vi-VN')}</Td>
                {canManage && (
                  <Td className="text-right">
                    <span className="inline-flex gap-1.5 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        <Pencil size={13} /> Sửa
                      </Button>
                      <Button variant="ghost" size="sm" disabled={remove.isPending} className="!text-danger"
                        onClick={() => { if (confirm(`Bỏ gán mã "${row.code}"?`)) remove.mutate(row.id) }}>
                        <Trash2 size={13} /> Xóa
                      </Button>
                    </span>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TableCard>
        {list.data && list.data.count > 0 && (
          <Pagination page={page} totalPages={totalPages} fetching={list.isFetching}
            pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
            onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
        )}

        <Modal open={addOpen} onClose={() => setAddOpen(false)}
          title={editing ? `Sửa mã "${editing.code}"` : 'Thêm mã mới'}
          icon={<Barcode size={18} className="text-flame" />}
          footer={<><Button variant="ghost" onClick={() => setAddOpen(false)}>Hủy</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !formCode.trim() || !formPart}>Lưu</Button></>}>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Mã vạch/QR *</label>
              <input value={formCode} onChange={(e) => setFormCode(e.target.value)} autoFocus
                placeholder="Gõ hoặc dán mã…"
                className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm font-mono focus:border-flame focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Sản phẩm *</label>
              <SearchableSelect value={formPart} onChange={setFormPart}
                options={partOptions} loading={partsLoading} placeholder="Gõ tên hoặc mã sản phẩm để tìm…" />
            </div>
          </div>
        </Modal>
      </>
      )}
    </div>
  )
}
