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
import { Barcode, Search, Link2, ScanLine, List, Plus, Pencil, Trash2, PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { formatDateTime } from '@/lib/crm'
import { useAuth, isWmsControl } from '@/lib/auth/store'
import { CameraScanner, type ScanKind } from '@/components/CameraScanner'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Modal } from '@/components/Modal'
import { usePartOptions } from '@/lib/useWmsOptions'
import type { CatalogPart, SerialNumber } from '@/lib/types'
import { PageHeader, Card, Button, Tag, TableCard, Th, Td, RowMsg, Pagination } from '@/components/ui'
import { PartQuickAddModal } from '@/pages/crm/PartQuickAddModal'

interface PartBarcodeRow { id: number; part: string; part_name: string; code: string; kind: '' | 'qr' | 'barcode'; created_at: string }

// Tách "mã sản phẩm" + "tên sản phẩm" từ nội dung QR — gặp 2 kiểu thực tế:
//  A) "<mã> ,<tên>"                                        (Tip/Nozzle...)
//  B) "#<id>,<mã>  ,<tên tiếng Nhật> ,<tên tiếng Anh...>    (Torch Body...)
//     ,<SL> ,<mã bản vẽ> ,<lô>" — kiểu B nhận biết qua tiền tố "#" ở đầu.
// Tách theo dấu phẩy nhưng GIỮ NGUYÊN đoạn nằm trong ngoặc — tên tiếng Anh
// kiểu B có thể chứa dấu phẩy bên trong ngoặc (VD "(Type A2, w/o Tip Body)"),
// tách thô sẽ cắt đôi tên sai.
function splitRespectingParens(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else { cur += ch }
  }
  parts.push(cur)
  return parts.map((s) => s.trim())
}

function guessPartFromQr(text: string): { tokin_part_no: string; display_name_vi: string } | null {
  const segs = splitRespectingParens(text)
  if (segs.length < 2) return null
  if (segs[0].startsWith('#')) {
    // Kiểu B (nhiều trường) — mã ở đoạn 2, tên tiếng Anh ở đoạn 4 (có thì ưu tiên,
    // không thì tạm lấy đoạn 3 — vẫn sửa được trên form trước khi lưu.
    const code = segs[1] ?? ''
    const name = segs[3] || segs[2] || ''
    if (!code) return null
    return { tokin_part_no: code, display_name_vi: name }
  }
  // Kiểu A (đơn giản, 2 trường).
  return { tokin_part_no: segs[0], display_name_vi: segs[1] ?? '' }
}

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
  const [quickAddOpen, setQuickAddOpen] = useState(false)   // mã QR lạ, sản phẩm chưa có trong hệ thống → thêm mới nhanh
  const { options: partOptions, isLoading: partsLoading } = usePartOptions()

  // 1 ảnh có 2 mã: 1 mã đã khớp sản phẩm có sẵn (VD QR → ra đúng part), mã còn
  // lại (Barcode) CHƯA gán cho ai — gợi ý gán bổ sung luôn 1 nút, khỏi phải
  // thao tác lại từ đầu (trước đây chỉ hiện mỗi mã chưa gán, mã đã khớp bị
  // "giấu" mất, dễ hiểu lầm sản phẩm chưa có trong hệ thống).
  const [completeSuggestion, setCompleteSuggestion] = useState<{ part: CatalogPart; missingCode: string; missingKind: ScanKind } | null>(null)
  // Mã lạ (không tìm thấy bằng nguyên nội dung QR) nhưng mã sản phẩm tách
  // được từ QR lại khớp 1 sản phẩm CÓ SẴN — gán thẳng, không gợi ý Thêm mới
  // (tránh tạo trùng mã sản phẩm đã tồn tại).
  const resolveAssignMut = useMutation({
    mutationFn: () => api.post(`/catalog/parts/${encodeURIComponent(guessedPartCheck.data!.tokin_part_no)}/set-barcode/`,
      { barcode: lookupQ.trim(), kind: lookupKind ?? '' }),
    onSuccess: (r) => {
      toast.success(`Đã gán mã QR cho ${r.data.part_no}`)
      qc.invalidateQueries({ queryKey: ['scan-lookup'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes-stats'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const completeMut = useMutation({
    mutationFn: () => api.post(`/catalog/parts/${encodeURIComponent(completeSuggestion!.part.tokin_part_no)}/set-barcode/`,
      { barcode: completeSuggestion!.missingCode, kind: completeSuggestion!.missingKind }),
    onSuccess: (r) => {
      toast.success(`Đã gán mã ${completeSuggestion?.missingKind === 'qr' ? 'QR' : 'Barcode'} cho ${r.data.part_no}`)
      setCompleteSuggestion(null)
      qc.invalidateQueries({ queryKey: ['scan-lookup'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes-stats'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

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
  const notFound = !!lookup.data && lookup.data.parts.length === 0 && lookup.data.serials.length === 0 && lookupQ.trim().length >= 2

  // Nội dung QR kiểu phức tạp dài cả trăm ký tự — tìm bằng NGUYÊN chuỗi đó
  // gần như không bao giờ ra kết quả (mã sản phẩm trong hệ thống ngắn hơn
  // nhiều, không thể "chứa" được cả chuỗi dài). Mã lạ (không tìm thấy) mà
  // tách được mã sản phẩm từ nội dung QR → thử tìm LẠI đúng bằng mã đã tách,
  // để phân biệt đúng "sản phẩm đã có, chỉ thiếu gán mã" với "sản phẩm chưa
  // có thật" — tránh gợi ý Thêm mới nhầm cho sản phẩm ĐÃ tồn tại.
  const guessedFromQr = lookupKind === 'qr' ? guessPartFromQr(lookupQ.trim()) : null
  const guessedPartCheck = useQuery({
    queryKey: ['guessed-part-check', guessedFromQr?.tokin_part_no],
    queryFn: () => api.get<{ results: CatalogPart[] }>('/catalog/parts/', { params: { search: guessedFromQr!.tokin_part_no } })
      .then((r) => r.data.results.find((p) => p.tokin_part_no === guessedFromQr!.tokin_part_no) ?? null),
    enabled: notFound && !!guessedFromQr && guessedFromQr.tokin_part_no !== lookupQ.trim(),
  })

  const assignMut = useMutation({
    mutationFn: async (partNo: string) => {
      let r
      try {
        r = await api.post(`/catalog/parts/${encodeURIComponent(partNo)}/set-barcode/`,
          { barcode: lookupQ.trim(), kind: lookupKind ?? '' })
      } catch (e) {
        throw new Error(`Mã "${lookupQ.trim()}" — ${apiError(e)}`)
      }
      if (hasExtraCode && extraCode.trim()) {
        const extraKind = lookupKind === 'qr' ? 'barcode' : lookupKind === 'barcode' ? 'qr' : ''
        try {
          await api.post(`/catalog/parts/${encodeURIComponent(partNo)}/set-barcode/`,
            { barcode: extraCode.trim(), kind: extraKind })
        } catch (e) {
          throw new Error(`Mã kèm theo "${extraCode.trim()}" — ${apiError(e)}`)
        }
      }
      return r
    },
    onSuccess: (r) => {
      const extra = hasExtraCode && extraCode.trim() ? ` + "${extraCode.trim()}"` : ''
      toast.success(`Đã gán "${lookupQ.trim()}"${extra} → ${r.data.part_no}. Lần sau quét ra ngay.`)
      setAssigning(false); setAssignPick(''); setHasExtraCode(false); setExtraCode('')
      qc.invalidateQueries({ queryKey: ['scan-lookup'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes-stats'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : apiError(e)),
  })

  // Chặn cứng (không chỉ cảnh báo) khi gán thêm mã sẽ vượt quá 2 mã/sản phẩm
  // (1 QR + 1 Barcode là đủ) hoặc trùng loại — khớp giới hạn ở backend
  // (PartBarcode.capacity_error), chặn sớm ở FE để khỏi phải round-trip lỗi.
  const assignBlockReason = (): string | null => {
    const existing = existingCodes.data ?? []
    if (existing.length >= 2) {
      return 'Sản phẩm này đã có đủ 2 mã rồi (1 QR + 1 Barcode) — không gán thêm được.'
    }
    if (lookupKind && existing.some((row) => row.kind === lookupKind)) {
      return `Sản phẩm này đã có mã ${lookupKind === 'qr' ? 'QR' : 'Barcode'} rồi.`
    }
    if (hasExtraCode && extraCode.trim()) {
      const extraKind = lookupKind === 'qr' ? 'barcode' : lookupKind === 'barcode' ? 'qr' : ''
      if (extraKind && existing.some((row) => row.kind === extraKind)) {
        return `Sản phẩm này đã có mã ${extraKind === 'qr' ? 'QR' : 'Barcode'} rồi (mã kèm theo).`
      }
    }
    return null
  }

  // 1 tấm ảnh đọc ra ≥2 mã khác loại (QR + Barcode trên cùng hộp) — tra cả 2
  // mã xem đã khớp sản phẩm nào chưa, để xử lý đúng từng trường hợp thay vì
  // chỉ hiện mỗi mã ĐẦU TIÊN đọc được (dễ hiểu lầm "chưa có sản phẩm" trong
  // khi mã còn lại đã khớp sẵn 1 sản phẩm có thật).
  const onMultiScanPrimary = async (results: { code: string; kind: ScanKind }[]) => {
    setCompleteSuggestion(null)
    const resolved = await Promise.all(results.map(async (r) => {
      try {
        const res = await api.get<{ results: CatalogPart[] }>('/catalog/parts/', { params: { search: r.code } })
        return { ...r, part: res.data.results[0] ?? null }
      } catch { return { ...r, part: null } }
    }))
    const found = resolved.filter((r) => r.part)
    const missing = resolved.filter((r) => !r.part)

    if (found.length === 1 && missing.length === 1) {
      // Đúng ca: 1 mã đã khớp sản phẩm, mã kia chưa gán cho ai — gợi ý gán bổ sung 1 nút.
      setLookupQ(found[0].code); setLookupKind(found[0].kind)
      setCompleteSuggestion({ part: found[0].part!, missingCode: missing[0].code, missingKind: missing[0].kind })
      return
    }

    const [first, ...rest] = results
    setLookupQ(first.code); setLookupKind(first.kind)
    const other = rest.find((r) => r.kind !== first.kind) ?? rest[0]
    if (other) { setHasExtraCode(true); setExtraCode(other.code) }
    if (found.length > 0) {
      const p = found[0].part!
      toast.success(`✓ Mã "${found[0].code}" đã gán sẵn cho: ${p.tokin_part_no} — ${p.display_name_vi}`)
    }
  }

  // Quét xong mà im lặng (chỉ hiện thẻ kết quả bên dưới) dễ làm người dùng
  // không chắc "đã lưu chưa" — quét trúng mã ĐÃ gán sẵn thì báo thẳng luôn,
  // không cần đợi mắt tìm thẻ kết quả. Gọi riêng 1 request nhỏ (không chờ
  // query `lookup` bên dưới) để chỉ báo đúng 1 lần/lượt quét, không lặp lại
  // khi gõ tay hay khi query tự refetch vì lý do khác.
  const notifyIfAlreadyAssigned = async (code: string) => {
    try {
      const r = await api.get<{ results: CatalogPart[] }>('/catalog/parts/', { params: { search: code } })
      const p = r.data.results[0]
      if (p) toast.success(`✓ Mã "${code}" đã gán sẵn cho: ${p.tokin_part_no} — ${p.display_name_vi}`)
    } catch { /* im lặng — không chặn luồng chính, thẻ kết quả bên dưới vẫn hiển thị bình thường */ }
  }

  // ─── Tab "Danh sách đã gán" ────────────────────────────────────────────
  const [listSearch, setListSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [editing, setEditing] = useState<PartBarcodeRow | null>(null)   // null=đóng, {}=thêm mới
  const [addOpen, setAddOpen] = useState(false)
  const [formCode, setFormCode] = useState('')
  const [formPart, setFormPart] = useState('')
  const [formKind, setFormKind] = useState<'' | 'qr' | 'barcode'>('')

  const list = useQuery({
    queryKey: ['part-barcodes', listSearch, page, pageSize],
    queryFn: () => fetchPage<PartBarcodeRow>('/catalog/part-barcodes/', { search: listSearch || undefined, page, page_size: pageSize }),
    enabled: tab === 'list',
  })
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.count / pageSize)) : 1
  const stats = useQuery({
    queryKey: ['part-barcodes-stats'],
    queryFn: () => api.get<{ total_parts: number; total_codes: number }>('/catalog/part-barcodes/stats/').then((r) => r.data),
    enabled: tab === 'list',
  })

  const save = useMutation({
    mutationFn: () => editing
      ? api.patch(`/catalog/part-barcodes/${editing.id}/`, { part: formPart, code: formCode, kind: formKind })
      : api.post('/catalog/part-barcodes/', { part: formPart, code: formCode, kind: formKind }),
    onSuccess: () => {
      toast.success(editing ? 'Đã lưu' : 'Đã thêm mã mới')
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes-stats'] })
      setAddOpen(false); setEditing(null); setFormCode(''); setFormPart(''); setFormKind('')
    },
    onError: (e) => toast.error(apiError(e)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/catalog/part-barcodes/${id}/`),
    onSuccess: () => {
      toast.success('Đã xóa')
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes-stats'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const openAdd = () => { setEditing(null); setFormCode(''); setFormPart(''); setFormKind(''); setAddOpen(true) }
  const openEdit = (row: PartBarcodeRow) => { setEditing(row); setFormCode(row.code); setFormPart(row.part); setFormKind(row.kind); setAddOpen(true) }

  // Gán bổ sung mã còn thiếu cho 1 sản phẩm (đã có QR → gán thêm Barcode, hoặc
  // ngược lại) — quét bị ép chỉ nhận đúng loại đang thiếu.
  const [fillFor, setFillFor] = useState<{ part: string; part_name: string; kind: ScanKind } | null>(null)
  const [fillManual, setFillManual] = useState('')
  const fillMut = useMutation({
    mutationFn: (code: string) => api.post(`/catalog/parts/${encodeURIComponent(fillFor!.part)}/set-barcode/`,
      { barcode: code.trim(), kind: fillFor!.kind }),
    onSuccess: (r) => {
      toast.success(`Đã gán mã ${fillFor?.kind === 'qr' ? 'QR' : 'Barcode'} cho ${r.data.part_no}`)
      setFillFor(null); setFillManual('')
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes-stats'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  // Gộp danh sách mã (1 dòng/mã, trả từ API) thành 1 dòng/sản phẩm với 2 cột
  // riêng QR/Barcode — dễ nhìn "sản phẩm này đủ/thiếu mã gì" hơn so với liệt
  // kê phẳng. Mã chưa rõ loại (dữ liệu cũ trước khi có field `kind`) tạm xếp
  // vào ô còn trống đầu tiên.
  interface PartGroup { part: string; part_name: string; qr: PartBarcodeRow | null; barcode: PartBarcodeRow | null; latest: string }
  const groups: PartGroup[] = []
  // Mã cũ gán từ trước khi có field `kind` (không rõ loại) — đoán theo nội
  // dung thay vì "ô nào trống điền trước" (dễ đoán sai thứ tự): mã toàn chữ
  // số (kiểu EAN/UPC) hầu như luôn là Barcode thật, QR ở hệ này thường có
  // chữ/dấu câu xen kẽ. Chỉ dùng để XẾP CỘT hiển thị — không ghi đè `kind`
  // thật trong DB (m vẫn có thể bấm Sửa để chốt lại loại chính xác).
  const looksLikeBarcode = (code: string) => /^\d{6,}$/.test(code)
  const byPart = new Map<string, PartGroup>()
  for (const row of list.data?.results ?? []) {
    let g = byPart.get(row.part)
    if (!g) { g = { part: row.part, part_name: row.part_name, qr: null, barcode: null, latest: row.created_at }; byPart.set(row.part, g); groups.push(g) }
    if (row.kind === 'qr' && !g.qr) g.qr = row
    else if (row.kind === 'barcode' && !g.barcode) g.barcode = row
    else if (!row.kind) {
      const guessBarcode = looksLikeBarcode(row.code)
      if (guessBarcode && !g.barcode) g.barcode = row
      else if (!guessBarcode && !g.qr) g.qr = row
      else if (!g.qr) g.qr = row
      else if (!g.barcode) g.barcode = row
    }
    if (row.created_at > g.latest) g.latest = row.created_at
  }

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
        <CameraScanner
          onScan={(c, k) => { setLookupQ(c); setLookupKind(k); setCompleteSuggestion(null); notifyIfAlreadyAssigned(c) }}
          onMultiScan={onMultiScanPrimary} />
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-2" />
          <input value={lookupQ} onChange={(e) => { setLookupQ(e.target.value); setLookupKind(null); setCompleteSuggestion(null) }}
            placeholder="Quét, tải ảnh, hoặc nhập mã hàng / serial…"
            className="w-full bg-ink-3 border border-line rounded-md pl-9 pr-3 py-2 text-sm focus:border-flame focus:outline-none" />
        </div>
        {completeSuggestion && (
          <Card>
            <p className="text-sm text-txt-2">
              Ảnh này có <b className="text-txt">2 mã</b> — mã <span className="font-mono text-flame">{lookupQ.trim()}</span> đã khớp sản phẩm{' '}
              <b>{completeSuggestion.part.tokin_part_no} — {completeSuggestion.part.display_name_vi}</b>.
            </p>
            <p className="text-sm text-txt-2 mt-1">
              Mã <span className="font-mono text-flame">{completeSuggestion.missingCode}</span>{' '}
              ({completeSuggestion.missingKind === 'qr' ? 'QR' : 'Barcode'}) đi kèm <b className="text-warn">chưa được gán</b> — gán luôn cho sản phẩm này chứ?
            </p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" disabled={completeMut.isPending} onClick={() => completeMut.mutate()}>
                <Link2 size={14} /> Gán luôn
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCompleteSuggestion(null)}>Bỏ qua</Button>
            </div>
          </Card>
        )}
        {lookup.isLoading && <p className="text-xs text-txt-2">Đang tìm…</p>}
        {notFound && guessedFromQr && guessedPartCheck.data && (
          <Card>
            <p className="text-sm text-txt-2">
              Mã QR này chưa gán, nhưng sản phẩm <b>{guessedPartCheck.data.tokin_part_no} — {guessedPartCheck.data.display_name_vi}</b> đã có sẵn trong hệ thống
              (nhận diện qua mã sản phẩm tách được từ nội dung QR).
            </p>
            <Button size="sm" className="mt-2" disabled={resolveAssignMut.isPending} onClick={() => resolveAssignMut.mutate()}>
              <Link2 size={14} /> Gán mã QR này cho sản phẩm
            </Button>
          </Card>
        )}
        {notFound && !(guessedFromQr && guessedPartCheck.data) && (
          <Card>
            <p className="text-sm text-txt-2 mb-2">
              Không tìm thấy "<span className="font-mono text-flame">{lookupQ.trim()}</span>". Tem này có thể <b>chưa gán</b>.
            </p>
            {!assigning ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAssigning(true)}>
                  <Link2 size={14} /> Gán mã này cho sản phẩm
                </Button>
                {lookupKind === 'qr' && guessedPartCheck.data === null && (
                  <Button size="sm" variant="ghost" onClick={() => setQuickAddOpen(true)}>
                    <PackagePlus size={14} /> Sản phẩm chưa có — Thêm mới
                  </Button>
                )}
              </div>
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
                      <CameraScanner
                        requireKind={lookupKind === 'qr' ? 'barcode' : lookupKind === 'barcode' ? 'qr' : undefined}
                        onScan={(c) => { setExtraCode(c); setScanningExtra(false) }} />
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
                  <p className={`text-[11px] ${assignBlockReason() ? 'text-danger' : 'text-txt-2'}`}>
                    Sản phẩm này đã có sẵn mã: {existingCodes.data.map((row) => (
                      <span key={row.id} className="font-mono text-flame mr-1.5">
                        {row.code}{row.kind && <span className="text-txt-2"> ({row.kind === 'qr' ? 'QR' : 'Barcode'})</span>}
                      </span>
                    ))}
                  </p>
                )}
                {assignPick && assignBlockReason() && (
                  <p className="text-[11px] text-danger font-medium">⛔ {assignBlockReason()}</p>
                )}
                {assignPick && (
                  <Button size="sm" disabled={assignMut.isPending || !!assignBlockReason()}
                    onClick={() => assignMut.mutate(assignPick)}>
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

      <PartQuickAddModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)}
        initial={lookupKind === 'qr' ? (guessPartFromQr(lookupQ.trim()) ?? undefined) : undefined}
        onSaved={async (p) => {
          try {
            await api.post(`/catalog/parts/${encodeURIComponent(p.tokin_part_no)}/set-barcode/`,
              { barcode: lookupQ.trim(), kind: lookupKind ?? '' })
            toast.success(`Đã thêm sản phẩm ${p.tokin_part_no} và gán mã QR luôn.`)
          } catch (e) { toast.error(apiError(e)) }
          qc.invalidateQueries({ queryKey: ['scan-lookup'] })
          qc.invalidateQueries({ queryKey: ['part-barcodes'] })
          qc.invalidateQueries({ queryKey: ['part-barcodes-stats'] })
        }} />

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
            <Th>Sản phẩm</Th><Th>Mã QR</Th><Th>Mã Barcode</Th><Th>Ngày gán</Th>
          </tr></thead>
          <tbody>
            {list.isLoading && <RowMsg colSpan={4}>Đang tải…</RowMsg>}
            {groups.length === 0 && !list.isLoading && <RowMsg colSpan={4}>Chưa gán mã nào.</RowMsg>}
            {groups.map((g) => (
              <tr key={g.part} className="border-b border-line/50 last:border-0">
                <Td className="font-medium">{g.part} — {g.part_name}</Td>
                <Td>
                  {g.qr ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-flame">{g.qr.code}</span>
                      {canManage && (
                        <>
                          <button onClick={() => openEdit(g.qr!)} className="text-txt-2 hover:text-flame" aria-label="Sửa mã QR"><Pencil size={12} /></button>
                          <button onClick={() => { if (confirm(`Bỏ gán mã QR "${g.qr!.code}"?`)) remove.mutate(g.qr!.id) }}
                            disabled={remove.isPending} className="text-txt-2 hover:text-danger" aria-label="Xóa mã QR"><Trash2 size={12} /></button>
                        </>
                      )}
                    </span>
                  ) : canManage ? (
                    <button onClick={() => setFillFor({ part: g.part, part_name: g.part_name, kind: 'qr' })}
                      className="text-[11px] text-txt-2 hover:text-flame inline-flex items-center gap-1">
                      <Plus size={12} /> Gán QR
                    </button>
                  ) : <span className="text-txt-2">—</span>}
                </Td>
                <Td>
                  {g.barcode ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-flame">{g.barcode.code}</span>
                      {canManage && (
                        <>
                          <button onClick={() => openEdit(g.barcode!)} className="text-txt-2 hover:text-flame" aria-label="Sửa mã Barcode"><Pencil size={12} /></button>
                          <button onClick={() => { if (confirm(`Bỏ gán mã Barcode "${g.barcode!.code}"?`)) remove.mutate(g.barcode!.id) }}
                            disabled={remove.isPending} className="text-txt-2 hover:text-danger" aria-label="Xóa mã Barcode"><Trash2 size={12} /></button>
                        </>
                      )}
                    </span>
                  ) : canManage ? (
                    <button onClick={() => setFillFor({ part: g.part, part_name: g.part_name, kind: 'barcode' })}
                      className="text-[11px] text-txt-2 hover:text-flame inline-flex items-center gap-1">
                      <Plus size={12} /> Gán Barcode
                    </button>
                  ) : <span className="text-txt-2">—</span>}
                </Td>
                <Td className="text-txt-2 text-xs whitespace-nowrap">{formatDateTime(g.latest)}</Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        {list.data && list.data.count > 0 && (
          <Pagination page={page} totalPages={totalPages} fetching={list.isFetching}
            pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
            onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
        )}
        {stats.data && (
          <p className="text-[11px] text-txt-2 mt-2">
            Đã gán mã cho <b className="text-txt">{stats.data.total_parts}</b> sản phẩm — tổng <b className="text-txt">{stats.data.total_codes}</b> mã (QR + Barcode).
          </p>
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
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Loại mã</label>
              <select value={formKind} onChange={(e) => setFormKind(e.target.value as '' | 'qr' | 'barcode')}
                className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm focus:border-flame focus:outline-none">
                <option value="">— Không rõ —</option>
                <option value="qr">QR</option>
                <option value="barcode">Barcode</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Sản phẩm *</label>
              <SearchableSelect value={formPart} onChange={setFormPart}
                options={partOptions} loading={partsLoading} placeholder="Gõ tên hoặc mã sản phẩm để tìm…" />
            </div>
          </div>
        </Modal>

        <Modal open={!!fillFor} onClose={() => { setFillFor(null); setFillManual('') }}
          title={`Gán mã ${fillFor?.kind === 'qr' ? 'QR' : 'Barcode'} cho ${fillFor?.part ?? ''}`}
          icon={<Barcode size={18} className="text-flame" />}
          footer={<><Button variant="ghost" onClick={() => { setFillFor(null); setFillManual('') }}>Hủy</Button>
            <Button onClick={() => fillMut.mutate(fillManual)} disabled={fillMut.isPending || !fillManual.trim()}>Gán</Button></>}>
          <div className="space-y-2">
            <p className="text-xs text-txt-2">{fillFor?.part_name}</p>
            {fillFor && (
              <CameraScanner requireKind={fillFor.kind} onScan={(c) => fillMut.mutate(c)} />
            )}
            <input value={fillManual} onChange={(e) => setFillManual(e.target.value)}
              placeholder={`…hoặc gõ tay mã ${fillFor?.kind === 'qr' ? 'QR' : 'Barcode'} nếu không quét được`}
              className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm font-mono focus:border-flame focus:outline-none" />
          </div>
        </Modal>
      </>
      )}
    </div>
  )
}
