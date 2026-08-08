/**
 * Tokinarc frontend — src/pages/wms/forms/BatchTransferForm.tsx
 * Chuyển kho HÀNG LOẠT — tích nhiều dòng tồn ở trang Tồn kho, chọn 1 bin đích
 * chung, chuyển hết 1 lần thay vì phải mở form từng dòng 1 (TransferForm.tsx).
 * Vẫn gọi cùng API /wms/inventory/transfer/ như chuyển đơn lẻ, chỉ là bắn
 * nhiều request nối tiếp nhau — không có endpoint batch riêng ở backend.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import type { InventoryItem } from '@/lib/types'
import type { Option } from '@/components/form'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { SelectInput } from '@/components/form'

export function BatchTransferForm({ open, onClose, items, binOptions }: {
  open: boolean; onClose: () => void; items: InventoryItem[]; binOptions: Option[]
}) {
  const qc = useQueryClient()
  const [toBin, setToBin] = useState('')
  // Số lượng chuyển từng dòng — mặc định lấy hết khả dụng, vẫn sửa được riêng từng dòng.
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({})

  useEffect(() => {
    if (open) {
      setToBin('')
      setQtyByItem(Object.fromEntries(items.map((i) => [i.id, i.qty_available])))
    }
  }, [open, items])

  const save = useMutation({
    mutationFn: async () => {
      const results: { item: InventoryItem; ok: boolean; detail?: string }[] = []
      for (const item of items) {
        const qty = qtyByItem[item.id] ?? 0
        if (item.bin === toBin) {
          results.push({ item, ok: false, detail: 'Đã ở đúng bin đích — bỏ qua' })
          continue
        }
        if (qty < 1) {
          results.push({ item, ok: false, detail: 'Số lượng không hợp lệ — bỏ qua' })
          continue
        }
        try {
          await api.post('/wms/inventory/transfer/', {
            from_bin: item.bin, to_bin: toBin,
            part: item.part ?? undefined, torch: item.torch ?? undefined, qty,
          })
          results.push({ item, ok: true })
        } catch (e) {
          results.push({ item, ok: false, detail: apiError(e) })
        }
      }
      return results
    },
    onSuccess: (results) => {
      const okCount = results.filter((r) => r.ok).length
      const failed = results.filter((r) => !r.ok)
      if (okCount) toast.success(`Đã chuyển ${okCount}/${results.length} mặt hàng.`)
      failed.forEach((r) => toast.error(`${r.item.display_name ?? r.item.item_name}: ${r.detail}`))
      qc.invalidateQueries({ queryKey: ['wms-inventory'] })
      qc.invalidateQueries({ queryKey: ['wms'] })
      qc.invalidateQueries({ queryKey: ['wms-moves'] })
      if (!failed.length) onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <Modal open={open} onClose={onClose} wide title={`Chuyển kho hàng loạt (${items.length} mục)`}
      icon={<ArrowLeftRight size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !toBin}>
            {save.isPending ? 'Đang chuyển…' : `Chuyển ${items.length} mục`}
          </Button>
        </>
      }>
      <div className="mb-3">
        <SelectInput label="Bin đích (áp dụng cho tất cả) *" full
          placeholder="— Chọn vị trí đích —" options={binOptions}
          value={toBin} onChange={(e) => setToBin(e.target.value)} />
      </div>
      <div className="max-h-[45vh] overflow-y-auto space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 bg-ink-3 rounded-md px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{item.display_name ?? item.item_name}</div>
              <div className="text-xs text-txt-2">
                Từ <span className="font-mono">{item.bin_code}</span> · Khả dụng: {item.qty_available} {item.unit}
                {toBin && item.bin === toBin && <span className="text-warn"> · Đã ở bin đích</span>}
              </div>
            </div>
            <input type="number" min={1} max={item.qty_available} value={qtyByItem[item.id] ?? 0}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setQtyByItem((m) => ({ ...m, [item.id]: Number(e.target.value) }))}
              className="w-20 bg-ink-2 border border-line rounded-md px-2 py-1.5 text-sm text-right focus:border-flame focus:outline-none" />
          </div>
        ))}
      </div>
    </Modal>
  )
}
