/**
 * Tokinarc frontend — src/pages/crm/PartQuickAddModal.tsx
 * Thêm nhanh 1 Phụ tùng mới vào danh mục — dùng khi đang tạo phiếu nhập kho mà
 * gõ tên hàng không tìm thấy (NV kho trở lên, khớp PartTorchWritePermission
 * backend — action 'create' mở cho NV kho, sửa/xóa vẫn cần Quản lý kho trở lên).
 * Chỉ các trường tối thiểu; sửa đầy đủ (giá bán, thuế…) vẫn làm ở trang Danh
 * mục sản phẩm.
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { TextInput } from '@/components/form'

export interface NewPart { tokin_part_no: string; display_name_vi: string }
interface Form { tokin_part_no: string; category: string; display_name_vi: string }

export function PartQuickAddModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void
  /** Gọi sau khi thêm thành công — nơi gọi tự chọn mặt hàng mới vào dòng hàng. */
  onSaved?: (p: NewPart) => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>()

  useEffect(() => {
    if (open) reset({ tokin_part_no: '', category: '', display_name_vi: '' })
  }, [open, reset])

  const save = useMutation({
    mutationFn: (d: Form) => api.post<NewPart>('/catalog/parts/', d),
    onSuccess: (r) => {
      toast.success(`Đã thêm mặt hàng ${r.data.tokin_part_no} vào danh mục`)
      qc.invalidateQueries({ queryKey: ['catalog-parts-opt'] })
      qc.invalidateQueries({ queryKey: ['catalog-parts'] })
      onSaved?.(r.data)
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title="Thêm mặt hàng mới vào danh mục"
      icon={<PackagePlus size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit((d) => save.mutate(d))} disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </>
      }>
      <form>
        <TextInput label="Mã phụ tùng *" full placeholder="VD: 002099"
          error={errors.tokin_part_no?.message}
          {...register('tokin_part_no', { required: 'Bắt buộc' })} />
        <TextInput label="Tên *" full placeholder="Tên hiển thị (VD: Cổ cong OTC đã qua sử dụng)"
          error={errors.display_name_vi?.message}
          {...register('display_name_vi', { required: 'Bắt buộc' })} />
        <TextInput label="Loại *" full placeholder="VD: Tip, Nozzle, Cổ cong…"
          error={errors.category?.message}
          {...register('category', { required: 'Bắt buộc' })} />
        <p className="text-[11px] text-txt-2 -mt-1">
          Thêm xong sẽ tự chọn vào dòng hàng ngay. Vào trang Danh mục sản phẩm để bổ sung giá bán/thuế đầy đủ sau.
        </p>
      </form>
    </Modal>
  )
}
