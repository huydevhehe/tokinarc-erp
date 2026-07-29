/**
 * Tokinarc frontend — src/pages/wms/BarcodeAssign.tsx
 * Gán mã vạch/QR cho sản phẩm: quét bằng camera HOẶC tải ảnh lên → tìm mã
 * trong danh mục; mã lạ (chưa gán) → tìm & chọn đúng sản phẩm để gán 1 lần,
 * từ đó quét lại tem đó luôn tự nhận ra sản phẩm.
 * (Tách riêng khỏi "Kiểm kê" 2026-07-28 — kiểm kê là đối chiếu tồn kho thực
 * tế, không phải nơi khai báo/gán mã cho danh mục sản phẩm.)
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Barcode, Search, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { CameraScanner } from '@/components/CameraScanner'
import type { CatalogPart, SerialNumber } from '@/lib/types'
import { PageHeader, Card, Button, Tag } from '@/components/ui'

export function BarcodeAssignPage() {
  const qc = useQueryClient()
  const [lookupQ, setLookupQ] = useState('')
  const [assigning, setAssigning] = useState(false)   // quét-gán: mã lạ → gán cho 1 SP
  const [assignPick, setAssignPick] = useState('')

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
    enabled: lookupQ.trim().length >= 2,
  })

  // Quét-gán: tìm SP để gán mã lạ vào.
  const assignSearch = useQuery({
    queryKey: ['assign-search', assignPick],
    queryFn: async () => (await api.get<{ results: CatalogPart[] }>('/catalog/parts/', { params: { search: assignPick.trim() } })).data.results.slice(0, 6),
    enabled: assigning && assignPick.trim().length >= 2,
  })
  const assignMut = useMutation({
    mutationFn: (partNo: string) => api.post(`/catalog/parts/${encodeURIComponent(partNo)}/set-barcode/`, { barcode: lookupQ.trim() }),
    onSuccess: (r) => {
      toast.success(`Đã gán "${lookupQ.trim()}" → ${r.data.part_no}. Lần sau quét ra ngay.`)
      setAssigning(false); setAssignPick('')
      qc.invalidateQueries({ queryKey: ['scan-lookup'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <div className="max-w-xl">
      <PageHeader icon={<Barcode size={20} className="text-flame" />} title="Gán mã vạch/QR"
        subtitle="Quét hoặc tải ảnh lên → tìm sản phẩm. Mã lạ (chưa gán) → chọn đúng sản phẩm, gán 1 lần." />

      <div className="space-y-3">
        <CameraScanner onScan={(c) => setLookupQ(c)} />
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-2" />
          <input value={lookupQ} onChange={(e) => setLookupQ(e.target.value)}
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
                <p className="text-[11px] text-txt-2">Tìm & chọn sản phẩm để gán mã <span className="font-mono">{lookupQ.trim()}</span>:</p>
                <input value={assignPick} onChange={(e) => setAssignPick(e.target.value)} autoFocus
                  placeholder="Tên hoặc mã sản phẩm…"
                  className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm focus:border-flame focus:outline-none" />
                {(assignSearch.data ?? []).map((p) => (
                  <button key={p.tokin_part_no} disabled={assignMut.isPending}
                    onClick={() => assignMut.mutate(p.tokin_part_no)}
                    className="w-full text-left flex items-center gap-2 border border-line rounded-md px-3 py-1.5 text-sm hover:border-flame transition-colors">
                    <span className="font-mono text-flame">{p.tokin_part_no}</span>
                    <span className="flex-1">{p.display_name_vi}</span>
                    <Link2 size={13} className="text-txt-2" />
                  </button>
                ))}
                <button onClick={() => { setAssigning(false); setAssignPick('') }} className="text-xs text-txt-2 hover:text-txt">Hủy</button>
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
    </div>
  )
}
