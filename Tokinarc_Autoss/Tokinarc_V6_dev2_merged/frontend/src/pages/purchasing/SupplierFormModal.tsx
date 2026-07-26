/**
 * Tokinarc frontend — src/pages/purchasing/SupplierFormModal.tsx
 * Modal Thêm/Sửa nhà cung cấp — dùng chung giữa trang Nhà cung cấp và các form
 * khác cần thêm nhanh 1 NCC mới (VD form Tạo phiếu nhập kho) mà không phải rời
 * trang. Gõ MST tự tra cứu tên/địa chỉ (chỉ áp dụng khi thêm mới).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { api, apiError } from '@/lib/api'
import { useDebounced } from '@/lib/useDebounced'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { FieldRow, TextInput } from '@/components/form'

export interface Supplier {
  id: string; code: string; name: string; tax_code: string; phone: string; email: string
  address?: string; notes?: string
}
interface Form { name: string; tax_code: string; phone: string; email: string; address: string }

export function SupplierFormModal({ open, onClose, editing, onSaved }: {
  open: boolean; onClose: () => void; editing?: Supplier | null
  onSaved?: (s: Supplier) => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, watch, setValue } = useForm<Form>()
  const taxCodeInput = watch('tax_code')
  const dTaxCodeLookup = useDebounced(taxCodeInput, 600)
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle')

  useEffect(() => {
    if (!open) return
    reset(editing
      ? { name: editing.name, tax_code: editing.tax_code, phone: editing.phone, email: editing.email, address: editing.address || '' }
      : { name: '', tax_code: '', phone: '', email: '', address: '' })
    setLookup('idle')
  }, [open, editing, reset])

  // Gõ MST -> tự tra cứu tên/địa chỉ doanh nghiệp (API công khai, không cần key).
  // Chỉ chạy khi THÊM MỚI (sửa NCC có sẵn thì giữ nguyên dữ liệu đã lưu).
  useEffect(() => {
    const mst = (dTaxCodeLookup || '').trim()
    if (!open || editing || mst.length < 10) { setLookup('idle'); return }
    let cancelled = false
    setLookup('loading')
    fetch(`https://api.vietqr.io/v2/business/${mst}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j?.code === '00' && j.data) {
          if (j.data.name) setValue('name', j.data.name)
          if (j.data.address) setValue('address', j.data.address)
          setLookup('found')
        } else {
          setLookup('notfound')
        }
      })
      .catch(() => { if (!cancelled) setLookup('notfound') })
    return () => { cancelled = true }
  }, [dTaxCodeLookup, open, editing, setValue])

  const save = useMutation({
    mutationFn: (d: Form) => editing
      ? api.patch<Supplier>(`/purchasing/suppliers/${editing.id}/`, d)
      : api.post<Supplier>('/purchasing/suppliers/', d),
    onSuccess: (r) => {
      toast.success(editing ? 'Đã lưu NCC' : 'Đã thêm NCC')
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['suppliers-opt'] })
      onSaved?.(r.data)
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <Modal open={open} onClose={onClose}
      title={editing ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
      icon={<Building size={18} className="text-flame" />}
      footer={<><Button variant="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={handleSubmit((d) => save.mutate(d))} disabled={save.isPending}>Lưu</Button></>}>
      <form>
        <div className="mb-3">
          <TextInput label="Mã số thuế" full
            placeholder="Nhập MST để tự điền tên + địa chỉ…"
            {...register('tax_code')} />
          {!editing && lookup === 'loading' && (
            <p className="text-[11px] text-txt-2 mt-1 flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Đang tra cứu…
            </p>
          )}
          {!editing && lookup === 'found' && (
            <p className="text-[11px] text-ok mt-1">✓ Đã tìm thấy, tự điền tên/địa chỉ bên dưới — vẫn có thể sửa lại.</p>
          )}
          {!editing && lookup === 'notfound' && (
            <p className="text-[11px] text-txt-2 mt-1">Không tìm thấy doanh nghiệp với MST này — tự nhập tay.</p>
          )}
        </div>
        <TextInput label="Tên *" full {...register('name', { required: true })} />
        <TextInput label="Địa chỉ" full {...register('address')} />
        <FieldRow>
          <TextInput label="Điện thoại" {...register('phone')} />
          <TextInput label="Email" {...register('email')} />
        </FieldRow>
      </form>
    </Modal>
  )
}
