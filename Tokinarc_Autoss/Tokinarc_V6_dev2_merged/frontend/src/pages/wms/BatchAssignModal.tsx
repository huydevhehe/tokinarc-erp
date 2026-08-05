/**
 * Tokinarc frontend — src/pages/wms/BatchAssignModal.tsx
 * Gán mã vạch/QR hàng loạt từ NHIỀU ảnh cùng lúc (tối đa MAX_BATCH ảnh/lượt).
 *
 * Nguyên tắc (chốt 2026-08-03):
 *   - Đọc hết N ảnh trước, KHÔNG ghi gì vào DB — chỉ ghi thật khi bấm "Lưu tất cả".
 *   - Ca tự động được (không cần người): mã đã khớp sẵn 1 sản phẩm (chỉ để xem,
 *     không cần làm gì) và ca "1 mã khớp sẵn + 1 mã đi kèm chưa gán trên cùng
 *     ảnh" (tự xếp gán mã kia cho đúng sản phẩm đã khớp).
 *   - MỌI ca còn lại (mã chưa gán, ảnh không đọc được, mã trùng giữa các ảnh,
 *     ảnh có >2 mã, 2 mã trong 1 ảnh khớp 2 sản phẩm khác nhau) — KHÔNG tự
 *     đoán, chỉ cảnh báo rõ tình huống + để nhân viên tự chọn sản phẩm/bỏ qua
 *     bằng đúng công cụ đã có (SearchableSelect / Thêm mới), không code AI đoán.
 */
import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { readBarcodes } from 'zxing-wasm/reader'
import { Images, Check, AlertTriangle, X, PackagePlus, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { usePartOptions } from '@/lib/useWmsOptions'
import { PartQuickAddModal } from '@/pages/crm/PartQuickAddModal'
import { guessPartFromQr } from '@/lib/qrParse'
import type { CatalogPart } from '@/lib/types'
import type { ScanKind } from '@/components/CameraScanner'

const MAX_BATCH = 10
const kindOf = (symbology: string): ScanKind => (symbology === 'QRCode' ? 'qr' : 'barcode')

interface PartRef { tokin_part_no: string; display_name_vi: string }
interface ImgResult { fileName: string; readable: boolean }
interface CodeRow {
  key: string; code: string; kind: ScanKind; imageIndex: number
  matchedPart: PartRef | null
  /** Mã chưa gán, NHƯNG tách được mã sản phẩm từ nội dung QR và sản phẩm đó đã
   *  có sẵn trong hệ thống — chỉ GỢI Ý (1 nút bấm là gán), không tự gán thay
   *  người. Giống hệt luồng quét lẻ, để batch không mời "Thêm mới" nhầm cho
   *  sản phẩm đã tồn tại. */
  suggestedPart: PartRef | null
  isDuplicate: boolean
  conflict: boolean          // 2 mã cùng ảnh khớp 2 sản phẩm KHÁC nhau
  auto: boolean              // tự xếp gán (không cần người) — vẫn hiện, người vẫn huỷ được
  autoReason: 'pair' | 'sibling' | null   // vì sao tự xếp: khớp theo mã đã gán / theo mã người vừa chọn cùng ảnh
  targetPart: string | null  // sản phẩm sẽ gán khi Lưu (auto điền hoặc người tự chọn)
  skip: boolean              // không đưa vào lượt Lưu (trùng lặp mặc định bị skip, người bấm "Bỏ qua" cũng vào đây)
  saved?: 'ok' | 'error'; savedMsg?: string
}

export function BatchAssignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { options: partOptions, isLoading: partsLoading } = usePartOptions()
  const [images, setImages] = useState<ImgResult[]>([])
  const [rows, setRows] = useState<CodeRow[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)          // tổng số ảnh của lượt đang đọc (hiện "3/10")
  const [quickAddFor, setQuickAddFor] = useState<string | null>(null)   // key của CodeRow đang thêm sản phẩm mới
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** Mã số lượt đọc ảnh. Đóng modal hoặc chọn lượt ảnh mới thì tăng lên, vòng
   *  lặp đang chạy dở của lượt cũ tự biết mình đã bị bỏ và ngừng ghi kết quả —
   *  không thì đóng giữa chừng, mở lại sẽ thấy kết quả lượt cũ hiện ra. */
  const runIdRef = useRef(0)

  const reset = () => { setImages([]); setRows([]); setProgress(0); setTotal(0) }
  const abortRun = () => { runIdRef.current += 1; setProcessing(false) }
  const close = () => { abortRun(); reset(); onClose() }

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    if (files.length > MAX_BATCH) {
      toast.error(`Chỉ chọn tối đa ${MAX_BATCH} ảnh/lượt — chọn ít hơn rồi tải lượt khác.`)
      return
    }
    abortRun()
    reset()
    const runId = runIdRef.current
    const alive = () => runIdRef.current === runId
    setTotal(files.length)
    setProcessing(true)
    const imgs: ImgResult[] = files.map((f) => ({ fileName: f.name, readable: true }))
    const rawByImage: { code: string; kind: ScanKind }[][] = []

    for (let i = 0; i < files.length; i++) {
      if (!alive()) return
      setProgress(i + 1)
      try {
        const results = await readBarcodes(files[i], { tryHarder: true, maxNumberOfSymbols: 4 })
        const found = results.filter((r) => r.text)
        if (found.length === 0) {
          imgs[i].readable = false
          rawByImage.push([])
        } else {
          // Cùng 1 ảnh mà đọc ra 2 lần CÙNG một mã (mã in 2 chỗ trên hộp, hoặc
          // thư viện trả trùng) thì chỉ giữ 1 — 2 dòng cùng mã trong 1 ảnh sẽ
          // trùng key, thao tác dòng này ảnh hưởng dòng kia.
          const seenInImg = new Set<string>()
          const codes: { code: string; kind: ScanKind }[] = []
          for (const r of found) {
            if (seenInImg.has(r.text)) continue
            seenInImg.add(r.text)
            codes.push({ code: r.text, kind: kindOf(r.symbology) })
          }
          rawByImage.push(codes)
        }
      } catch {
        imgs[i].readable = false
        rawByImage.push([])
      }
      if (!alive()) return
      setImages([...imgs])
    }

    // Tra cứu sản phẩm đã khớp cho từng mã DUY NHẤT (đỡ gọi API trùng lặp).
    const uniqueCodes = [...new Set(rawByImage.flat().map((c) => c.code))]
    const matchMap = new Map<string, PartRef | null>()
    await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const r = await api.get<{ results: CatalogPart[] }>('/catalog/parts/', { params: { search: code } })
        const exact = r.data.results.find((p) => p.barcodes?.includes(code))
        matchMap.set(code, exact ? { tokin_part_no: exact.tokin_part_no, display_name_vi: exact.display_name_vi } : null)
      } catch { matchMap.set(code, null) }
    }))

    // Mã QR chưa gán → thử tách mã sản phẩm từ nội dung QR, xem sản phẩm đó đã
    // có sẵn chưa (khớp CHÍNH XÁC mã sản phẩm, không đoán mò). Có thì gợi ý để
    // nhân viên bấm 1 nút là gán, khỏi phải tự tìm, và khỏi bị mời "Thêm mới"
    // cho sản phẩm vốn đã tồn tại.
    const qrUnmatched = [...new Set(rawByImage.flat()
      .filter((c) => c.kind === 'qr' && !matchMap.get(c.code)).map((c) => c.code))]
    const suggestMap = new Map<string, PartRef | null>()
    await Promise.all(qrUnmatched.map(async (code) => {
      const partNo = guessPartFromQr(code)?.tokin_part_no || code.trim()
      try {
        const r = await api.get<{ results: CatalogPart[] }>('/catalog/parts/', { params: { search: partNo } })
        const exact = r.data.results.find((p) => p.tokin_part_no === partNo)
        suggestMap.set(code, exact ? { tokin_part_no: exact.tokin_part_no, display_name_vi: exact.display_name_vi } : null)
      } catch { suggestMap.set(code, null) }
    }))
    if (!alive()) return

    // Dựng danh sách dòng mã + đánh dấu trùng lặp (mã đã thấy ở ảnh trước đó).
    const seen = new Set<string>()
    const built: CodeRow[] = []
    rawByImage.forEach((codes, idx) => {
      codes.forEach((c) => {
        const isDuplicate = seen.has(c.code)
        seen.add(c.code)
        const matchedPart = matchMap.get(c.code) ?? null
        built.push({
          key: `${idx}-${c.code}`, code: c.code, kind: c.kind, imageIndex: idx,
          matchedPart,
          suggestedPart: matchedPart ? null : (suggestMap.get(c.code) ?? null),
          isDuplicate, conflict: false, auto: false, autoReason: null, targetPart: null, skip: isDuplicate,
        })
      })
    })

    // Ca tự động: đúng 2 mã/ảnh, 1 khớp sẵn + 1 chưa gán → xếp gán mã kia cho
    // đúng sản phẩm đã khớp. Đúng 2 mã/ảnh, khớp 2 sản phẩm KHÁC nhau → gắn cờ
    // xung đột (không tự làm gì, chỉ cảnh báo).
    imgs.forEach((_, idx) => {
      const ofImg = built.filter((r) => r.imageIndex === idx && !r.isDuplicate)
      if (ofImg.length === 2) {
        const matched = ofImg.filter((r) => r.matchedPart)
        const unmatched = ofImg.filter((r) => !r.matchedPart)
        if (matched.length === 1 && unmatched.length === 1) {
          unmatched[0].targetPart = matched[0].matchedPart!.tokin_part_no
          unmatched[0].auto = true
          unmatched[0].autoReason = 'pair'
        } else if (matched.length === 2 && matched[0].matchedPart!.tokin_part_no !== matched[1].matchedPart!.tokin_part_no) {
          matched[0].conflict = true; matched[1].conflict = true
        }
      }
    })

    setRows(built)
    setProcessing(false)
  }

  const setTarget = (key: string, partNo: string) => {
    setRows((rs) => {
      const row = rs.find((r) => r.key === key)
      if (!row) return rs
      const target = partNo || null
      // 1 ảnh = 1 hộp = 1 sản phẩm: ảnh có đúng 2 mã (QR + Barcode) mà nhân
      // viên vừa chọn sản phẩm cho 1 mã thì mã còn lại điền theo luôn, khỏi
      // phải chọn 2 lần. Vẫn hiện rõ ở mục "Sẽ tự gán" và huỷ được. Ảnh ra >2
      // mã thì KHÔNG tự điền — đã cảnh báo là ảnh bất thường, để người tự quyết.
      const siblingCount = rs.filter((r) => r.imageIndex === row.imageIndex && !r.isDuplicate).length
      return rs.map((r) => {
        if (r.key === key) return { ...r, targetPart: target, skip: false, auto: false, autoReason: null }
        const isSiblingOf = siblingCount === 2 && r.imageIndex === row.imageIndex
          && !r.matchedPart && !r.isDuplicate && r.saved !== 'ok'
        if (isSiblingOf && target && (!r.targetPart || r.autoReason === 'sibling')) {
          return { ...r, targetPart: target, skip: false, auto: true, autoReason: 'sibling' as const }
        }
        // Người XOÁ lựa chọn ở mã kia thì mã điền-theo cũng phải bỏ theo, không
        // thì vẫn hiện "gán theo sản phẩm bạn vừa chọn" trong khi họ vừa bỏ chọn.
        if (isSiblingOf && !target && r.autoReason === 'sibling') {
          return { ...r, targetPart: null, auto: false, autoReason: null }
        }
        return r
      })
    })
  }
  const toggleSkip = (key: string, skip: boolean) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, skip } : r)))
  }

  // Chỉ những dòng: chưa khớp sản phẩm nào từ trước, có target đã chọn (auto
  // hoặc tay), không bị bỏ qua, CHƯA lưu thành công — mới thật sự gọi API khi
  // Lưu (dòng lưu lỗi vẫn nằm lại để bấm Lưu thử lại).
  const toSave = rows.filter((r) => !r.matchedPart && !r.skip && r.targetPart && r.saved !== 'ok')
  /** Dòng còn "đang chờ xử lý": chưa lưu xong và chưa bị bỏ qua — dòng bỏ qua
   *  phải rời khỏi mục của nó, không thì nhìn tưởng vẫn sẽ được lưu. */
  const pending = (r: CodeRow) => r.saved !== 'ok' && !r.skip

  const saveAll = useMutation({
    mutationFn: async () => {
      // Gán LẦN LƯỢT chứ không bắn song song: 2 dòng cùng 1 mã (ảnh trùng được
      // bấm "Vẫn xử lý") mà gán cho 2 sản phẩm khác nhau, nếu bắn cùng lúc thì
      // 2 request đều thấy "mã chưa có ai giữ" rồi cùng ghi → vỡ ràng buộc mã
      // duy nhất (lỗi 500 khó hiểu). Đi tuần tự thì cái sau nhận đúng thông báo
      // "mã này đã gán cho sản phẩm X". Nhiều nhất ~20 mã/lượt nên không chậm.
      const results: { key: string; ok: boolean; msg?: string }[] = []
      for (const r of toSave) {
        try {
          await api.post(`/catalog/parts/${encodeURIComponent(r.targetPart!)}/set-barcode/`,
            { barcode: r.code, kind: r.kind })
          results.push({ key: r.key, ok: true })
        } catch (e) {
          results.push({ key: r.key, ok: false, msg: apiError(e) })
        }
      }
      return results
    },
    onSuccess: (results) => {
      setRows((rs) => rs.map((r) => {
        const res = results.find((x) => x.key === r.key)
        return res ? { ...r, saved: res.ok ? 'ok' : 'error', savedMsg: res.ok ? undefined : res.msg } : r
      }))
      const okCount = results.filter((r) => r.ok).length
      const failCount = results.length - okCount
      if (failCount === 0) toast.success(`Đã gán xong ${okCount} mã.`)
      else toast.error(`Gán được ${okCount} mã, ${failCount} mã bị lỗi — xem chi tiết từng dòng.`)
      qc.invalidateQueries({ queryKey: ['part-barcodes'] })
      qc.invalidateQueries({ queryKey: ['part-barcodes-stats'] })
      qc.invalidateQueries({ queryKey: ['catalog-parts-opt'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const unreadableCount = images.filter((im) => !im.readable).length
  const readyCount = toSave.length

  return (
    <>
    <Modal open={open} onClose={close} wide title="Gán hàng loạt từ nhiều ảnh"
      icon={<Images size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Đóng</Button>
          <Button disabled={readyCount === 0 || saveAll.isPending} onClick={() => saveAll.mutate()}>
            {saveAll.isPending ? 'Đang lưu…' : `Lưu tất cả (${readyCount})`}
          </Button>
        </>
      }>
      <div className="space-y-3">
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
          <Button variant="ghost" size="sm" disabled={processing} onClick={() => fileInputRef.current?.click()}>
            <Images size={13} /> {processing ? `Đang đọc ảnh ${progress}/${total}…` : `Chọn nhiều ảnh (tối đa ${MAX_BATCH})`}
          </Button>
          <p className="text-[11px] text-txt-2 mt-1">
            Đọc hết ảnh xong mới hiện danh sách bên dưới — chưa lưu gì vào hệ thống cho tới khi bấm "Lưu tất cả".
          </p>
        </div>

        {images.length > 0 && (
          <div className="space-y-2">
            {unreadableCount > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">
                {unreadableCount} ảnh không đọc được mã — thử chụp lại rõ nét hơn:{' '}
                {images.filter((im) => !im.readable).map((im) => im.fileName).join(', ')}
              </div>
            )}
            {rows.length === 0 && unreadableCount === images.length && !processing && (
              <p className="text-sm text-txt-2">Không đọc được mã nào trong {images.length} ảnh đã chọn.</p>
            )}

            {/* Xung đột tách RIÊNG, không nhét chung mục "không cần làm gì" —
                ca này người phải kiểm tra tem thật, không được lướt qua. */}
            {rows.filter((r) => r.conflict && !r.isDuplicate).length > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-md p-2 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-danger font-semibold">
                  Cần kiểm tra tem — 2 mã trên cùng 1 ảnh đang thuộc 2 sản phẩm khác nhau
                </p>
                {rows.filter((r) => r.conflict && !r.isDuplicate).map((r) => (
                  <div key={r.key} className="text-xs flex items-center gap-1.5 flex-wrap">
                    <AlertTriangle size={12} className="text-danger shrink-0" />
                    <span className="font-mono text-flame">{r.code}</span>
                    <span className="text-txt-2">({r.kind === 'qr' ? 'QR' : 'Barcode'}) — Ảnh "{images[r.imageIndex]?.fileName}" đang thuộc</span>
                    <b>{r.matchedPart!.tokin_part_no} — {r.matchedPart!.display_name_vi}</b>
                  </div>
                ))}
                <p className="text-[11px] text-txt-2">
                  Hệ thống không tự sửa gì. Nếu tem dán nhầm, vào tab "Danh sách đã gán" xoá mã gán sai rồi quét lại.
                </p>
              </div>
            )}

            {rows.filter((r) => r.matchedPart && !r.isDuplicate && !r.conflict).length > 0 && (
              <div className="bg-ink-3 rounded-md p-2 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-txt-2 font-semibold">Đã khớp sẵn — không cần làm gì</p>
                {rows.filter((r) => r.matchedPart && !r.isDuplicate && !r.conflict).map((r) => (
                  <div key={r.key} className="text-xs flex items-center gap-1.5">
                    <Check size={12} className="text-ok shrink-0" />
                    <span className="font-mono text-flame">{r.code}</span>
                    <span className="text-txt-2">({r.kind === 'qr' ? 'QR' : 'Barcode'}) — Ảnh "{images[r.imageIndex]?.fileName}" →</span>
                    <b>{r.matchedPart!.tokin_part_no} — {r.matchedPart!.display_name_vi}</b>
                  </div>
                ))}
              </div>
            )}

            {rows.filter((r) => r.auto && pending(r)).length > 0 && (
              <div className="bg-ok/10 border border-ok/30 rounded-md p-2 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-ok font-semibold">Sẽ tự gán khi bấm Lưu</p>
                {rows.filter((r) => r.auto && pending(r)).map((r) => (
                  <div key={r.key} className="text-xs flex items-center gap-2">
                    <span className="font-mono text-flame">{r.code}</span>
                    <span className="text-txt-2">({r.kind === 'qr' ? 'QR' : 'Barcode'}) → sẽ gán cho <b>{r.targetPart}</b>{' '}
                      ({r.autoReason === 'sibling'
                        ? 'theo sản phẩm bạn vừa chọn cho mã kia trên cùng ảnh'
                        : 'khớp theo mã đi kèm trên cùng ảnh'})</span>
                    <button onClick={() => toggleSkip(r.key, true)} className="text-txt-2 hover:text-danger ml-auto" title="Huỷ, không tự gán mã này">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {rows.filter((r) => !r.matchedPart && !r.auto && pending(r)).length > 0 && (
              <div className="bg-warn/10 border border-warn/30 rounded-md p-2 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-warn font-semibold">Cần bạn tự chọn sản phẩm</p>
                {rows.filter((r) => !r.matchedPart && !r.auto && pending(r)).map((r) => {
                  const sameImgCount = rows.filter((x) => x.imageIndex === r.imageIndex && !x.isDuplicate).length
                  return (
                    <div key={r.key} className="text-xs space-y-1 border-b border-warn/20 last:border-0 pb-2 last:pb-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <AlertTriangle size={12} className="text-warn shrink-0" />
                        <span className="font-mono text-flame">{r.code}</span>
                        <span className="text-txt-2">({r.kind === 'qr' ? 'QR' : 'Barcode'}) — Ảnh "{images[r.imageIndex]?.fileName}"</span>
                        {sameImgCount > 2 && (
                          <span className="text-warn">— ảnh này đọc ra {sameImgCount} mã, nhiều hơn 2 (1 hộp thường chỉ có QR+Barcode) — kiểm tra lại ảnh có bị dính hộp khác không.</span>
                        )}
                      </div>
                      {r.suggestedPart && !r.targetPart && (
                        <div className="flex items-center gap-2 flex-wrap bg-ink-3 rounded px-2 py-1.5">
                          <span className="text-txt-2">
                            Sản phẩm <b className="text-txt">{r.suggestedPart.tokin_part_no} — {r.suggestedPart.display_name_vi}</b>{' '}
                            đã có sẵn trong hệ thống (nhận diện qua mã sản phẩm tách được từ nội dung QR).
                          </span>
                          <Button size="sm" className="ml-auto" onClick={() => setTarget(r.key, r.suggestedPart!.tokin_part_no)}>
                            <Link2 size={12} /> Gán mã này cho sản phẩm
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1">
                          <SearchableSelect value={r.targetPart ?? ''} onChange={(v) => setTarget(r.key, v)}
                            options={partOptions} loading={partsLoading}
                            placeholder="Gõ tên/mã sản phẩm để gán mã này…" />
                        </div>
                        {/* Sản phẩm đã có sẵn thì KHÔNG mời "Thêm mới" — tránh tạo trùng danh mục. */}
                        {!r.suggestedPart && (
                          <Button variant="ghost" size="sm" onClick={() => setQuickAddFor(r.key)}>
                            <PackagePlus size={12} /> Thêm mới
                          </Button>
                        )}
                        <button onClick={() => toggleSkip(r.key, true)} className="text-txt-2 hover:text-txt text-[11px] whitespace-nowrap">Bỏ qua</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Dòng người tự bấm "Bỏ qua"/"Huỷ" — vẫn phải thấy được và lấy
                lại được, không thì bấm nhầm là mất mã, phải tải ảnh lại. */}
            {rows.filter((r) => r.skip && !r.isDuplicate && r.saved !== 'ok').length > 0 && (
              <div className="bg-ink-3 rounded-md p-2 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-txt-2 font-semibold">Bạn đã bỏ qua — sẽ không lưu</p>
                {rows.filter((r) => r.skip && !r.isDuplicate && r.saved !== 'ok').map((r) => (
                  <div key={r.key} className="text-xs flex items-center gap-1.5">
                    <span className="font-mono text-flame">{r.code}</span>
                    <span className="text-txt-2">({r.kind === 'qr' ? 'QR' : 'Barcode'}) — Ảnh "{images[r.imageIndex]?.fileName}"</span>
                    <button onClick={() => toggleSkip(r.key, false)} className="text-flame hover:underline ml-auto whitespace-nowrap">Xử lý lại mã này</button>
                  </div>
                ))}
              </div>
            )}

            {rows.filter((r) => r.isDuplicate && r.skip).length > 0 && (
              <div className="bg-ink-3 rounded-md p-2 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-txt-2 font-semibold">Mã trùng giữa các ảnh — mặc định bỏ qua</p>
                {rows.filter((r) => r.isDuplicate && r.skip).map((r) => (
                  <div key={r.key} className="text-xs flex items-center gap-1.5">
                    <span className="font-mono text-flame">{r.code}</span>
                    <span className="text-txt-2">— trùng với mã đã thấy ở ảnh trước, ảnh "{images[r.imageIndex]?.fileName}" đang bị bỏ qua.</span>
                    {r.skip && (
                      <button onClick={() => toggleSkip(r.key, false)} className="text-flame hover:underline ml-auto whitespace-nowrap">Vẫn xử lý mã này</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {rows.some((r) => r.saved) && (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-txt-2 font-semibold">Kết quả lưu</p>
                {rows.filter((r) => r.saved).map((r) => (
                  <div key={r.key} className={`text-xs flex items-center gap-1.5 ${r.saved === 'ok' ? 'text-ok' : 'text-danger'}`}>
                    {r.saved === 'ok' ? <Check size={12} /> : <AlertTriangle size={12} />}
                    <span className="font-mono">{r.code}</span>
                    {r.saved === 'ok' ? <span>→ đã gán cho {r.targetPart}</span> : <span>{r.savedMsg}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>

    <PartQuickAddModal open={!!quickAddFor} onClose={() => setQuickAddFor(null)}
      initial={(() => {
        const row = rows.find((r) => r.key === quickAddFor)
        return row?.kind === 'qr' ? (guessPartFromQr(row.code) ?? undefined) : undefined
      })()}
      onSaved={(p) => {
        if (quickAddFor) setTarget(quickAddFor, p.tokin_part_no)
        setQuickAddFor(null)
      }} />
    </>
  )
}
