/**
 * Tokinarc frontend — src/pages/wms/forms/InboundForm.tsx
 * Tạo đơn nhập kho kèm dòng hàng (item + SL dự kiến + bin đích). POST /wms/inbound/.
 */
import { useEffect, useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, PackageCheck, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { fetchAll } from '@/lib/list'
import { resolveScanToItem } from '@/lib/scanResolve'
import { useWarehouseOptions, useItemOptions, splitItem } from '@/lib/useWmsOptions'
import { CameraScanner } from '@/components/CameraScanner'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { FieldRow, TextInput, SelectInput, formatMoneyDisplay, parseMoneyInput } from '@/components/form'
import { SearchableSelect } from '@/components/SearchableSelect'
import { SupplierFormModal } from '@/pages/purchasing/SupplierFormModal'
import { PartQuickAddModal } from '@/pages/crm/PartQuickAddModal'
import { useAuth, isWmsControl } from '@/lib/auth/store'
import type { InboundOrder } from '@/lib/types'

interface BinLite { id: string; full_code: string; warehouse_code: string }
interface SupplierLite { id: string; name: string }
interface POLineLite { part: string; qty: number; unit_cost: string | number; qty_received: number }
interface POLite {
  id: string; code: string; supplier_name: string; warehouse: string; status: string
  lines: POLineLite[]
}
interface LineForm {
  item: string; qty_expected: number; target_bin: string
  unit_cost: number; tax_pct: string; serials: string
  // Lô chỉ dành cho vật tư (Part) — súng hàn quản theo từng cây bằng serial.
  lot_no: string; lot_expires: string
}
interface Form {
  warehouse: string; supplier: string; invoice_no: string; invoice_date: string
  flow_type: '' | 'internal' | 'supplier'; purchase_order: string; manual_po_no: string
  delivered_by_name: string; received_at: string; notes: string
  lines: LineForm[]
}
const EMPTY_LINE: LineForm = { item: '', qty_expected: 1, target_bin: '', unit_cost: 0, tax_pct: '',
  serials: '', lot_no: '', lot_expires: '' }
const EMPTY: Form = {
  warehouse: '', supplier: '', invoice_no: '', invoice_date: '',
  flow_type: '', purchase_order: '', manual_po_no: '', delivered_by_name: '', received_at: '', notes: '',
  lines: [{ ...EMPTY_LINE }],
}

export function InboundForm({ open, onClose, editing }: {
  open: boolean; onClose: () => void; editing?: InboundOrder | null
}) {
  const qc = useQueryClient()
  const { options: whs, items: whItems } = useWarehouseOptions()
  const { options: items, isLoading: itemsLoading, unitByValue } = useItemOptions()
  const bins = useQuery({ queryKey: ['wms-bins-opt'], queryFn: () => fetchAll<BinLite>('/wms/bins/') })
  const binItems = bins.data?.items ?? []
  // #10/#11 biên bản: NCC phải SỔ TÊN CÓ SẴN (dropdown), không gõ tay tự do.
  const suppliers = useQuery({ queryKey: ['suppliers-opt'], queryFn: () => fetchAll<SupplierLite>('/purchasing/suppliers/') })
  const supplierNames = (suppliers.data?.items ?? []).map((s) => s.name)
  // Luồng NCC: chọn đơn mua đã đặt hàng → kéo NCC/kho/dòng hàng còn thiếu vào phiếu.
  const pos = useQuery({ queryKey: ['po-eligible-for-inbound'], queryFn: () => fetchAll<POLite>('/purchasing/orders/') })
  const poOptions = (pos.data?.items ?? [])
    .filter((p) => p.status === 'ordered' || p.status === 'partial')
    .map((p) => ({ value: p.id, label: `${p.code} — ${p.supplier_name}` }))
  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<Form>({ defaultValues: EMPTY })
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lines' })
  const watched = (useWatch({ control, name: 'lines' }) as LineForm[] | undefined) ?? []
  const flowType = useWatch({ control, name: 'flow_type' })
  const purchaseOrder = useWatch({ control, name: 'purchase_order' })
  const manualPoNo = useWatch({ control, name: 'manual_po_no' })
  const watchedSupplier = (useWatch({ control, name: 'supplier' }) as string | undefined) ?? ''
  // Ô "Bin đích" chỉ được liệt kê ô nằm trong ĐÚNG kho đã chọn. Trước đây liệt
  // kê toàn bộ ô của mọi kho — chọn nhầm ô kho khác thì hàng cộng sang kho đó,
  // tồn kho hai kho cùng sai mà nhìn phiếu không thấy gì lạ.
  const watchedWarehouse = (useWatch({ control, name: 'warehouse' }) as string | undefined) ?? ''
  const whCode = whItems.find((w) => w.id === watchedWarehouse)?.code ?? ''
  const binOptions = binItems
    .filter((b) => !whCode || b.warehouse_code === whCode)
    .map((b) => ({ value: b.id, label: b.full_code }))
  // Đổi kho giữa chừng → bỏ những bin đã chọn nay không còn thuộc kho mới,
  // không thì nó nằm im trong form rồi bị backend chặn lúc bấm Tạo.
  useEffect(() => {
    if (!whCode) return
    watched.forEach((l, i) => {
      if (l?.target_bin && !binOptions.some((o) => o.value === l.target_bin)) {
        setValue(`lines.${i}.target_bin` as const, '')
      }
    })
  }, [whCode, binItems.length])   // eslint-disable-line react-hooks/exhaustive-deps
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [addPartForLine, setAddPartForLine] = useState<number | null>(null)   // dòng đang thêm mặt hàng mới
  const role = useAuth((s) => s.user?.role)
  // Thêm nhanh mặt hàng mới: NV kho trở lên (khớp PartTorchWritePermission backend
  // — chỉ nới action 'create', sửa/xóa sản phẩm vẫn cần Quản lý kho trở lên).
  const canAddPart = isWmsControl(role) || role === 'warehouse'

  // Chọn 1 đơn mua → tự điền kho/NCC + dòng hàng (SL còn lại chưa nhận, đơn giá theo PO).
  const onPickPO = (poId: string) => {
    setValue('purchase_order', poId, { shouldValidate: true })
    setValue('manual_po_no', '')
    const po = (pos.data?.items ?? []).find((p) => p.id === poId)
    if (!po) return
    setValue('warehouse', po.warehouse, { shouldValidate: true })
    setValue('supplier', po.supplier_name)
    const remaining = po.lines
      .map((l) => ({ ...l, remaining: l.qty - l.qty_received }))
      .filter((l) => l.remaining > 0)
    if (remaining.length > 0) {
      replace(remaining.map((l) => ({
        item: `part:${l.part}`, qty_expected: l.remaining, target_bin: '',
        unit_cost: Number(l.unit_cost), tax_pct: '', serials: '',
        lot_no: '', lot_expires: '',
      })))
    }
  }
  // Ô "Đơn mua" nhận giá trị từ SearchableSelect (allowCreate): nếu khớp 1 PO có
  // sẵn → chọn như bình thường (tự điền kho/NCC/dòng hàng); nếu là chuỗi tự gõ
  // (PO chưa nhập vào hệ thống) → chỉ lưu làm ghi chú tham chiếu (manual_po_no).
  const onChangePOField = (v: string) => {
    if ((pos.data?.items ?? []).some((p) => p.id === v)) { onPickPO(v); return }
    setValue('purchase_order', '')
    setValue('manual_po_no', v, { shouldValidate: true })
  }
  const itemLabel = (v: string) => items.find((o) => o.value === v)?.label ?? v
  const filled = watched.filter((l) => l?.item)
  const totalQty = filled.reduce((s, l) => s + (Number(l.qty_expected) || 0), 0)
  const [showCam, setShowCam] = useState(false)

  // Quét camera NGAY KHI TẠO PHIẾU: quét mã → tự thêm dòng; quét lại cùng mã → +1 SL.
  const onScan = async (raw: string) => {
    const val = await resolveScanToItem(raw, items)
    if (!val) { toast.error(`Không tìm thấy mặt hàng cho mã "${raw}"`); return }
    const idx = watched.findIndex((l) => l?.item === val)
    if (idx >= 0) {
      // Quét lại mã đã có → cộng dồn. Phải nói RÕ số cũ → số mới: trước đây chỉ
      // hiện tên hàng nên số lượng tự nhảy mà người quét không hay biết.
      const truoc = Number(watched[idx].qty_expected) || 0
      setValue(`lines.${idx}.qty_expected`, truoc + 1)
      toast.success(`${itemLabel(val)} — số lượng: ${truoc} → ${truoc + 1}`)
      return
    }
    const empty = watched.findIndex((l) => !l?.item)
    if (empty >= 0) setValue(`lines.${empty}.item`, val)
    else append({ ...EMPTY_LINE, item: val })
    toast.success(`✓ Đã thêm ${itemLabel(val)} — số lượng: 1`)
  }

  useEffect(() => {
    if (!open) return
    reset(editing ? {
      warehouse: editing.warehouse,
      supplier: editing.supplier ?? '', invoice_no: editing.invoice_no ?? '',
      invoice_date: editing.invoice_date ?? '',
      flow_type: editing.flow_type ?? '', purchase_order: editing.purchase_order ?? '',
      manual_po_no: editing.manual_po_no ?? '',
      delivered_by_name: editing.delivered_by_name ?? '',
      received_at: editing.received_at ? editing.received_at.slice(0, 10) : '', notes: editing.notes ?? '',
      lines: (editing.lines ?? []).map((l) => ({
        item: l.part ? `part:${l.part}` : (l.torch ? `torch:${l.torch}` : ''),
        qty_expected: l.qty_expected, target_bin: l.target_bin ?? '',
        unit_cost: Number(l.unit_cost ?? 0),
        tax_pct: l.tax_pct != null ? String(l.tax_pct) : '',
        serials: l.serials_raw ?? '',
        lot_no: l.lot_no ?? '', lot_expires: l.lot_expires ?? '',
      })),
    } : EMPTY)
  }, [open, editing, reset])

  const save = useMutation({
    mutationFn: (d: Form) => {
      const payload = {
        // Tạo mới: KHÔNG gửi code — backend tự sinh IN-YYYY-NNN (xem
        // InboundViewSet.perform_create). Sửa: giữ nguyên mã cũ, không đổi.
        ...(editing ? { code: editing.code } : {}),
        warehouse: d.warehouse, supplier: d.supplier, invoice_no: d.invoice_no,
        invoice_date: d.invoice_date || null,
        flow_type: d.flow_type || 'internal',
        purchase_order: d.flow_type === 'supplier' ? (d.purchase_order || null) : null,
        manual_po_no: d.flow_type === 'supplier' ? d.manual_po_no : '',
        delivered_by_name: d.delivered_by_name, received_at: d.received_at || null, notes: d.notes,
        lines: d.lines.map((l) => {
          const it = splitItem(l.item)
          return {
            ...it,
            qty_expected: Number(l.qty_expected) || 0,
            target_bin: l.target_bin || null,
            unit_cost: Number(l.unit_cost) || 0,
            tax_pct: l.tax_pct !== '' ? Number(l.tax_pct) : null,
            // Lô và serial dùng được cho cả vật tư lẫn súng hàn, khai một trong
            // hai hoặc cả hai đều được — kho cần truy xuất từ cả hai đường.
            lot_no: l.lot_no || '',
            lot_expires: l.lot_expires || null,
            serials_raw: l.serials || '',
          }
        }),
      }
      return editing
        ? api.patch(`/wms/inbound/${editing.id}/`, payload)
        : api.post('/wms/inbound/', payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Đã cập nhật phiếu nhập' : 'Đã tạo đơn nhập')
      qc.invalidateQueries({ queryKey: ['wms-inbound-list'] })
      qc.invalidateQueries({ queryKey: ['wms'] })
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  const onSubmit = (d: Form) => {
    if (d.flow_type === 'supplier' && !d.purchase_order && !d.manual_po_no) {
      toast.error('Phiếu nhập NCC phải chọn hoặc nhập số Đơn mua'); return
    }
    // Ba chốt chặn dưới đây backend cũng chặn — kiểm sẵn ở đây để báo ngay tại
    // chỗ, khỏi bắt người dùng bấm Tạo rồi mới biết sai.
    if (d.flow_type === 'supplier' && !d.supplier.trim()) {
      toast.error('Phiếu nhập từ Nhà cung cấp phải chọn nhà cung cấp'); return
    }
    if (d.received_at && d.received_at > new Date().toISOString().slice(0, 10)) {
      toast.error('Ngày nhập kho không được ở tương lai — hàng chưa về thì chưa nhập kho được'); return
    }
    const sl = d.lines.filter((l) => l.item && !(Number(l.qty_expected) > 0))
    if (sl.length) {
      toast.error('Số lượng phải lớn hơn 0'); return
    }
    // Hạn dùng chỉ có ý nghĩa khi đi kèm số lô — backend bỏ qua hạn của dòng
    // không có lô, người nhập sẽ tưởng đã lưu được hạn.
    const thieuLo = d.lines.find((l) => l.item && l.lot_expires && !l.lot_no.trim())
    if (thieuLo) {
      toast.error('Có dòng điền hạn dùng nhưng bỏ trống số lô — điền số lô, hoặc xoá hạn dùng đi'); return
    }
    // Serial là để tra bảo hành từng cây: khai thiếu/thừa so với số lượng là lỗ
    // hổng chỉ lộ ra khi khách mang súng tới bảo hành. Không khai serial thì
    // vẫn cho qua (kho có thể chưa kịp ghi), chỉ chặn khi khai mà lệch.
    for (const l of d.lines) {
      const ser = (l.serials || '').split('\n').map((s) => s.trim()).filter(Boolean)
      if (!ser.length) continue
      if (ser.length !== Number(l.qty_expected)) {
        toast.error(`Khai ${ser.length} serial nhưng số lượng là ${l.qty_expected} — phải khớp nhau`); return
      }
      if (new Set(ser).size !== ser.length) {
        toast.error('Có serial bị khai trùng trong cùng một dòng'); return
      }
    }
    // Không lô, không serial → sau này không truy xuất được dòng hàng đó. Chỉ
    // NHẮC rồi để người nhập quyết: hàng tiêu hao mua theo thùng thường chẳng có
    // số nào cả, chặn cứng thì nhân viên sẽ bịa số cho qua — số bịa hại hơn để trống.
    const khongTruyXuat = d.lines.filter((l) => l.item && !l.lot_no.trim() && !(l.serials || '').trim())
    if (khongTruyXuat.length) {
      const dsMa = khongTruyXuat.map((l) => splitItem(l.item).part || splitItem(l.item).torch).join(', ')
      const ok = window.confirm(
        `Chưa khai lô lẫn serial cho: ${dsMa}.\n\n` +
        'Hàng nhập vẫn cộng tồn bình thường, nhưng sau này sẽ không truy xuất được ' +
        'theo lô hay theo từng cái (thu hồi hàng lỗi, tra bảo hành).\n\nVẫn tạo phiếu?')
      if (!ok) return
    }
    save.mutate(d)
  }

  return (
    <>
    <Modal open={open} onClose={onClose} wide title={editing ? `Sửa phiếu nhập ${editing.code}` : 'Tạo đơn nhập kho'}
      icon={<PackageCheck size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Tạo'}
          </Button>
        </>
      }>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FieldRow>
          {editing
            ? <TextInput label="Mã đơn" value={editing.code} disabled readOnly />
            : <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Mã đơn</label>
                <p className="text-sm text-txt-2 py-2">Tự động tạo khi lưu (IN-{new Date().getFullYear()}-xxx)</p>
              </div>}
          <SelectInput label="Kho *" error={errors.warehouse?.message}
            placeholder="— Chọn kho —" options={whs}
            {...register('warehouse', { required: 'Chọn kho' })} />
        </FieldRow>
        <FieldRow>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Nhà cung cấp</label>
            <input type="hidden" {...register('supplier')} />
            <div className="flex gap-1.5">
              <div className="flex-1">
                <SearchableSelect
                  value={watchedSupplier}
                  onChange={(v) => setValue('supplier', v, { shouldValidate: true })}
                  options={[...new Set([...(editing?.supplier ? [editing.supplier] : []), ...supplierNames])]
                    .map((n) => ({ value: n, label: n }))}
                  loading={suppliers.isLoading} placeholder="Gõ tên để tìm NCC…" />
              </div>
              <Button type="button" variant="ghost" onClick={() => setSupplierModalOpen(true)} aria-label="Thêm NCC mới">
                <Plus size={15} />
              </Button>
            </div>
          </div>
          <SelectInput label="Loại phiếu nhập *" error={errors.flow_type?.message}
            placeholder="— Chọn loại —"
            options={[{ value: 'internal', label: 'Nội bộ' }, { value: 'supplier', label: 'Nhà cung cấp (NCC)' }]}
            {...register('flow_type', { required: 'Chọn loại phiếu nhập' })} />
        </FieldRow>
        {flowType === 'supplier' && (
          <FieldRow>
            <div className="col-span-2">
              <input type="hidden" {...register('purchase_order')} />
              <input type="hidden" {...register('manual_po_no')} />
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Đơn mua *</label>
              <SearchableSelect
                value={purchaseOrder || manualPoNo || ''}
                onChange={onChangePOField}
                options={poOptions} loading={pos.isLoading} allowCreate
                placeholder="Gõ mã PO/tên NCC để tìm, hoặc nhập số PO chưa có trong hệ thống…" />
              <p className="text-[11px] text-txt-2 mt-1">
                Chọn 1 đơn đã đặt (chưa nhận đủ) → tự điền kho/NCC/dòng hàng còn lại.
                {' '}PO chưa có trong hệ thống → gõ số PO rồi bấm "+ Dùng ..." (chỉ lưu để đối chiếu, không tự điền).
              </p>
            </div>
          </FieldRow>
        )}
        <FieldRow>
          <TextInput label="Số hóa đơn/phiếu NCC" placeholder="VD: HD-12345"
            {...register('invoice_no')} />
          <TextInput label="Ngày xuất hoá đơn" type="date"
            {...register('invoice_date')} />
        </FieldRow>
        <FieldRow>
          <TextInput label="Người giao hàng" placeholder="Tên nhân viên NCC/bên giao hàng"
            {...register('delivered_by_name')} />
          <TextInput label="Ngày nhập kho" type="date"
            max={new Date().toISOString().slice(0, 10)}
            {...register('received_at')} />
        </FieldRow>
        <p className="text-[11px] text-txt-2 -mt-2 mb-3">
          Để trống → hệ thống tự ghi ngày lúc xác nhận nhận hàng (có thể sửa lại sau ở danh sách).
        </p>
        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Ghi chú</label>
          <textarea rows={2} placeholder="Ghi chú thêm cho phiếu nhập…"
            {...register('notes')}
            className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm focus:border-flame focus:outline-none" />
        </div>
        {flowType === 'supplier' && (
          <p className="text-[11px] text-warn mb-1.5">
            Luồng NCC: cần điền đủ <b>Đơn giá</b> cho từng dòng trước khi Xác nhận nhận hàng.
            Thuế (%) không bắt buộc — để trống nếu NCC nước ngoài không phát sinh VAT.
          </p>
        )}
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-txt-2">Dòng hàng</span>
          <span className="inline-flex gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCam((v) => !v)}>
              <Camera size={13} /> {showCam ? 'Tắt quét' : 'Quét mã'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => append({ ...EMPTY_LINE })}>
              <Plus size={13} /> Thêm dòng
            </Button>
          </span>
        </div>
        {showCam && (
          <div className="mb-2">
            <CameraScanner onScan={onScan} />
            <p className="text-[11px] text-txt-2 mt-1">Quét tem hàng → tự thêm dòng; quét lại cùng mã → +1 SL. Nhớ chọn Bin đích trước khi tạo.</p>
          </div>
        )}
        <div className="space-y-2 mb-3">
          {fields.map((f, i) => {
            const picked = splitItem(watched[i]?.item || '')
            // Chọn xong mặt hàng mới hiện ô lô/serial — cả hai đều dùng được cho
            // vật tư lẫn súng hàn, khai một trong hai hoặc cả hai tuỳ hàng.
            const daChonHang = !!(picked.part || picked.torch)
            return (
            <div key={f.id} className="border border-line/40 rounded-md p-2 space-y-1.5">
              <div className="flex items-start gap-2">
                {/* input ẩn giữ nguyên đăng ký react-hook-form (validate required
                    khi submit) — ô hiển thị là SearchableSelect, đồng bộ qua setValue. */}
                <input type="hidden" {...register(`lines.${i}.item` as const, { required: true })} />
                <div className="flex-1">
                  <SearchableSelect
                    value={watched[i]?.item ?? ''}
                    onChange={(v) => setValue(`lines.${i}.item` as const, v, { shouldValidate: true })}
                    options={items} loading={itemsLoading} placeholder="Gõ mã/tên để tìm mặt hàng…" />
                </div>
                {canAddPart && (
                  <button type="button" onClick={() => setAddPartForLine(i)}
                    className="text-txt-2 hover:text-flame p-1.5 shrink-0" aria-label="Thêm mặt hàng mới"
                    title="Không tìm thấy? Thêm mặt hàng mới vào danh mục">
                    <Plus size={15} />
                  </button>
                )}
                <button type="button" onClick={() => fields.length > 1 && remove(i)}
                  className="text-txt-2 hover:text-danger p-1.5 shrink-0 disabled:opacity-30" disabled={fields.length <= 1} aria-label="Xóa">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className={`grid grid-cols-2 gap-2 ${flowType === 'internal' ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">
                    SL{unitByValue[watched[i]?.item ?? ''] ? ` (${unitByValue[watched[i]?.item ?? '']})` : ''}
                  </label>
                  <input type="number" min={1} placeholder="SL"
                    {...register(`lines.${i}.qty_expected` as const, { valueAsNumber: true, min: 1 })}
                    onFocus={(e) => e.target.select()}
                    className="w-full bg-ink-3 border border-line rounded-md px-2 py-1.5 text-sm focus:border-flame focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">Đơn giá nhập</label>
                  <input type="text" inputMode="numeric" placeholder="Đơn giá nhập"
                    value={formatMoneyDisplay(watched[i]?.unit_cost ?? 0)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setValue(`lines.${i}.unit_cost` as const, parseMoneyInput(e.target.value))}
                    className="w-full bg-ink-3 border border-line rounded-md px-2 py-1.5 text-sm focus:border-flame focus:outline-none" />
                </div>
                {flowType !== 'internal' && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">Thuế %</label>
                    <input type="number" min={0} max={100} step="0.01" placeholder="Thuế %"
                      {...register(`lines.${i}.tax_pct` as const)}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-ink-3 border border-line rounded-md px-2 py-1.5 text-sm focus:border-flame focus:outline-none" />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">Bin đích</label>
                  <input type="hidden" {...register(`lines.${i}.target_bin` as const)} />
                  <SearchableSelect
                    value={watched[i]?.target_bin ?? ''}
                    onChange={(v) => setValue(`lines.${i}.target_bin` as const, v)}
                    options={binOptions} loading={bins.isLoading}
                    placeholder={whCode ? '— Bin đích —' : '— Chọn kho trước —'} />
                </div>
              </div>
              {daChonHang && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">
                        Số lô
                      </label>
                      <input type="text" placeholder="Số lô in trên thùng NCC — VD: A1"
                        {...register(`lines.${i}.lot_no` as const)}
                        className="w-full bg-ink-3 border border-line rounded-md px-2 py-1.5 text-sm focus:border-flame focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">Hạn dùng của lô</label>
                      <input type="date"
                        {...register(`lines.${i}.lot_expires` as const)}
                        className="w-full bg-ink-3 border border-line rounded-md px-2 py-1.5 text-sm focus:border-flame focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">
                      Serial (mỗi dòng 1 serial)
                    </label>
                    <textarea rows={2} placeholder="Serial từng cái — cho bảo hành, truy xuất từng cái…"
                      {...register(`lines.${i}.serials` as const)}
                      className="w-full bg-ink-3 border border-line rounded-md px-2 py-1.5 text-xs focus:border-flame focus:outline-none" />
                  </div>
                  <p className="text-[10px] text-txt-2">
                    Lô và serial đều không bắt buộc — khai một trong hai, hoặc cả hai. Bỏ trống
                    cả hai thì sau này không truy xuất được lô hàng này.
                  </p>
                </>
              )}
            </div>
          )})}
        </div>

        {/* Xem trước nội dung sắp tạo */}
        {filled.length > 0 && (
          <div className="border-t border-line pt-2 mt-1">
            <div className="text-[11px] uppercase tracking-wide text-txt-2 mb-1">Xem trước</div>
            <ul className="text-sm space-y-0.5">
              {filled.map((l, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate">{itemLabel(l.item)}</span>
                  <span className="tabular-nums text-txt-2 ml-3">× {Number(l.qty_expected) || 0}</span>
                </li>
              ))}
            </ul>
            <div className="text-xs text-txt-2 mt-1">{filled.length} mặt hàng · tổng SL dự kiến <b className="text-txt">{totalQty}</b></div>
          </div>
        )}
      </form>
    </Modal>

    <SupplierFormModal open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)}
      onSaved={(s) => setValue('supplier', s.name, { shouldValidate: true })} />
    <PartQuickAddModal open={addPartForLine != null} onClose={() => setAddPartForLine(null)}
      onSaved={(p) => {
        if (addPartForLine != null) setValue(`lines.${addPartForLine}.item`, `part:${p.tokin_part_no}`, { shouldValidate: true })
      }} />
    </>
  )
}
