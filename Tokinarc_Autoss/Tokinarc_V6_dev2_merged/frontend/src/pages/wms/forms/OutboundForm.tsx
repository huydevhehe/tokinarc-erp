/**
 * Tokinarc frontend — src/pages/wms/forms/OutboundForm.tsx
 * Tạo đơn xuất kho kèm dòng hàng. POST /wms/outbound/.
 */
import { useEffect, useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, PackageCheck, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { resolveScanToItem } from '@/lib/scanResolve'
import { useWarehouseOptions, useItemOptions, splitItem } from '@/lib/useWmsOptions'
import { useOutboundCustomerOptions } from '@/lib/useCustomerOptions'
import { RULE_LABEL, OUTBOUND_PURPOSE_LABEL } from '@/lib/wms'
import { CameraScanner } from '@/components/CameraScanner'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { FieldRow, TextInput, SelectInput } from '@/components/form'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { OutboundOrder } from '@/lib/types'

interface LineForm { item: string; qty_ordered: number }
interface Form {
  warehouse: string; customer: string
  sales_order_code: string; rule: string; purpose: string; lines: LineForm[]
}
const EMPTY_LINE: LineForm = { item: '', qty_ordered: 1 }
const EMPTY: Form = {
  warehouse: '', customer: '', sales_order_code: '', rule: 'FIFO', purpose: 'sale',
  lines: [{ ...EMPTY_LINE }],
}

export function OutboundForm({ open, onClose, editing }: {
  open: boolean; onClose: () => void; editing?: OutboundOrder | null
}) {
  const qc = useQueryClient()
  const { options: whs } = useWarehouseOptions()
  const { options: items, isLoading: itemsLoading } = useItemOptions()
  const { options: customers, isLoading: customersLoading } = useOutboundCustomerOptions()
  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<Form>({ defaultValues: EMPTY })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const watched = (useWatch({ control, name: 'lines' }) as LineForm[] | undefined) ?? []
  const watchedCustomer = (useWatch({ control, name: 'customer' }) as string | undefined) ?? ''
  const itemLabel = (v: string) => items.find((o) => o.value === v)?.label ?? v
  const filled = watched.filter((l) => l?.item)
  const totalQty = filled.reduce((s, l) => s + (Number(l.qty_ordered) || 0), 0)
  const [showCam, setShowCam] = useState(false)

  // Quét camera NGAY KHI TẠO PHIẾU XUẤT: quét mã → tự thêm dòng; cùng mã → +1 SL.
  const onScan = async (raw: string) => {
    const val = await resolveScanToItem(raw, items)
    if (!val) { toast.error(`Không tìm thấy mặt hàng cho mã "${raw}"`); return }
    const idx = watched.findIndex((l) => l?.item === val)
    if (idx >= 0) {
      setValue(`lines.${idx}.qty_ordered`, (Number(watched[idx].qty_ordered) || 0) + 1)
    } else {
      const empty = watched.findIndex((l) => !l?.item)
      if (empty >= 0) setValue(`lines.${empty}.item`, val)
      else append({ ...EMPTY_LINE, item: val })
    }
    toast.success(`✓ ${itemLabel(val)}`)
  }

  useEffect(() => {
    if (!open) return
    reset(editing ? {
      warehouse: editing.warehouse, customer: editing.customer ?? '',
      sales_order_code: editing.sales_order_code ?? '', rule: editing.rule, purpose: editing.purpose,
      lines: (editing.lines ?? []).map((l) => ({
        item: l.part ? `part:${l.part}` : (l.torch ? `torch:${l.torch}` : ''),
        qty_ordered: l.qty_ordered,
      })),
    } : EMPTY)
  }, [open, editing, reset])

  const save = useMutation({
    mutationFn: (d: Form) => {
      const payload = {
        // Tạo mới: KHÔNG gửi code — backend tự sinh OUT-YYYY-NNN (xem
        // OutboundViewSet.perform_create). Sửa: giữ nguyên mã cũ, không đổi.
        ...(editing ? { code: editing.code } : {}),
        warehouse: d.warehouse,
        customer: d.customer || null,
        sales_order_code: d.sales_order_code,
        rule: d.rule,
        purpose: d.purpose,
        lines: d.lines.map((l) => ({ ...splitItem(l.item), qty_ordered: Number(l.qty_ordered) || 0 })),
      }
      return editing
        ? api.patch(`/wms/outbound/${editing.id}/`, payload)
        : api.post('/wms/outbound/', payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Đã cập nhật phiếu xuất' : 'Đã tạo đơn xuất')
      qc.invalidateQueries({ queryKey: ['wms-outbound-list'] })
      qc.invalidateQueries({ queryKey: ['wms'] })
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <Modal open={open} onClose={onClose} xwide
      title={editing ? `Sửa phiếu xuất ${editing.code}` : 'Tạo đơn xuất kho'}
      icon={<PackageCheck size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit((d) => save.mutate(d))} disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : editing ? 'Lưu' : 'Tạo'}
          </Button>
        </>
      }>
      <form onSubmit={handleSubmit((d) => save.mutate(d))}>
        <FieldRow>
          {editing
            ? <TextInput label="Mã đơn" value={editing.code} disabled readOnly />
            : <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Mã đơn</label>
                <p className="text-sm text-txt-2 py-2">Tự động tạo khi lưu (OUT-{new Date().getFullYear()}-xxx)</p>
              </div>}
          <SelectInput label="Kho *" error={errors.warehouse?.message}
            placeholder="— Chọn kho —" options={whs}
            {...register('warehouse', { required: 'Chọn kho' })} />
        </FieldRow>
        <FieldRow>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Khách hàng</label>
            <input type="hidden" {...register('customer')} />
            <SearchableSelect
              value={watchedCustomer}
              onChange={(v) => setValue('customer', v)}
              options={customers} loading={customersLoading} placeholder="— (tùy chọn) — gõ mã/tên để tìm…" />
          </div>
          <SelectInput label="Rule soạn hàng"
            options={(Object.keys(RULE_LABEL) as (keyof typeof RULE_LABEL)[]).map((k) => ({ value: k, label: RULE_LABEL[k] }))}
            {...register('rule')} />
        </FieldRow>
        <FieldRow>
          <SelectInput label="Mục đích xuất kho"
            options={(Object.keys(OUTBOUND_PURPOSE_LABEL) as (keyof typeof OUTBOUND_PURPOSE_LABEL)[])
              .map((k) => ({ value: k, label: OUTBOUND_PURPOSE_LABEL[k] }))}
            {...register('purpose')} />
        </FieldRow>

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
            <p className="text-[11px] text-txt-2 mt-1">Quét tem hàng → tự thêm dòng; quét lại cùng mã → +1 SL.</p>
          </div>
        )}
        <div className="space-y-2 mb-3">
          {fields.map((f, i) => (
            <div key={f.id} className="border border-line/40 rounded-md p-2">
              <div className="flex items-end gap-2">
                {/* input ẩn giữ nguyên đăng ký react-hook-form (validate required
                    khi submit) — ô hiển thị là SearchableSelect, đồng bộ qua setValue. */}
                <input type="hidden" {...register(`lines.${i}.item` as const, { required: true })} />
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">Mặt hàng</label>
                  <SearchableSelect
                    value={watched[i]?.item ?? ''}
                    onChange={(v) => setValue(`lines.${i}.item` as const, v, { shouldValidate: true })}
                    options={items} loading={itemsLoading} placeholder="Gõ mã/tên để tìm mặt hàng…" />
                </div>
                <div className="w-28 shrink-0">
                  <label className="block text-[10px] uppercase tracking-wide text-txt-2 mb-0.5">SL</label>
                  <input type="number" min={1} placeholder="SL"
                    {...register(`lines.${i}.qty_ordered` as const, { valueAsNumber: true })}
                    className="w-full bg-ink-3 border border-line rounded-md px-2 py-1.5 text-sm focus:border-flame focus:outline-none" />
                </div>
                <button type="button" onClick={() => fields.length > 1 && remove(i)}
                  className="text-txt-2 hover:text-danger p-1.5 shrink-0 disabled:opacity-30" disabled={fields.length <= 1} aria-label="Xóa">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Xem trước nội dung sắp tạo */}
        {filled.length > 0 && (
          <div className="border-t border-line pt-2 mt-1">
            <div className="text-[11px] uppercase tracking-wide text-txt-2 mb-1">Xem trước</div>
            <ul className="text-sm space-y-0.5">
              {filled.map((l, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate">{itemLabel(l.item)}</span>
                  <span className="tabular-nums text-txt-2 ml-3">× {Number(l.qty_ordered) || 0}</span>
                </li>
              ))}
            </ul>
            <div className="text-xs text-txt-2 mt-1">{filled.length} mặt hàng · tổng SL xuất <b className="text-txt">{totalQty}</b></div>
          </div>
        )}
      </form>
    </Modal>
  )
}
