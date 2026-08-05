/**
 * Tokinarc frontend — src/pages/crm/PartQuickAddModal.tsx
 * Thêm nhanh 1 Phụ tùng mới vào danh mục — dùng khi đang tạo phiếu nhập kho mà
 * gõ tên hàng không tìm thấy (NV kho trở lên, khớp PartTorchWritePermission
 * backend — action 'create' mở cho NV kho, sửa/xóa vẫn cần Quản lý kho trở lên).
 * Chỉ các trường tối thiểu; sửa đầy đủ (giá bán, thuế…) vẫn làm ở trang Danh
 * mục sản phẩm.
 */
import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { TextInput } from '@/components/form'
import { SearchableSelect } from '@/components/SearchableSelect'

export interface NewPart { tokin_part_no: string; display_name_vi: string }
interface Form { tokin_part_no: string; category: string; display_name_vi: string; product_category: string }
interface ProductCategoryLite { id: number; name: string }
interface ProductGroupLite { id: number; name: string; categories: ProductCategoryLite[] }

export function PartQuickAddModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void
  /** Gọi sau khi thêm thành công — nơi gọi tự chọn mặt hàng mới vào dòng hàng. */
  onSaved?: (p: NewPart) => void
  /** Điền sẵn (VD tách được từ nội dung QR quét được) — vẫn sửa được trước khi lưu. */
  initial?: { tokin_part_no?: string; display_name_vi?: string }
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<Form>()

  const groups = useQuery({
    queryKey: ['product-groups-opt'],
    queryFn: async () => (await api.get<{ results: ProductGroupLite[] } | ProductGroupLite[]>('/catalog/product-groups/')).data,
    enabled: open,
  })
  const groupList: ProductGroupLite[] = Array.isArray(groups.data) ? groups.data : (groups.data?.results ?? [])
  // Gộp Nhóm + Danh mục thành 1 ô chọn duy nhất (mặt hàng gắn thẳng vào Danh mục,
  // không phải Nhóm) — gọn hơn 2 tầng chọn cho 1 modal "thêm nhanh".
  const categoryOptions = groupList.flatMap((g) =>
    g.categories.map((c) => ({ value: String(c.id), label: `${g.name} — ${c.name}` })))

  useEffect(() => {
    if (open) reset({
      tokin_part_no: initial?.tokin_part_no ?? '', category: '',
      display_name_vi: initial?.display_name_vi ?? '', product_category: '',
    })
  }, [open, reset, initial])

  const save = useMutation({
    mutationFn: (d: Form) => {
      // Khớp 1 Danh mục có sẵn → gửi thẳng id. Không khớp (gõ tên mới, allowCreate)
      // → gửi làm product_category_name, backend tự tìm/tạo Nhóm+Danh mục cùng tên.
      const matched = categoryOptions.some((o) => o.value === d.product_category)
      return api.post<NewPart>('/catalog/parts/', {
        tokin_part_no: d.tokin_part_no, category: d.category, display_name_vi: d.display_name_vi,
        product_category: matched ? d.product_category : null,
        product_category_name: matched ? '' : d.product_category,
      })
    },
    onSuccess: (r) => {
      toast.success(`Đã thêm mặt hàng ${r.data.tokin_part_no} vào danh mục`)
      qc.invalidateQueries({ queryKey: ['catalog-parts-opt'] })
      qc.invalidateQueries({ queryKey: ['catalog-parts'] })
      qc.invalidateQueries({ queryKey: ['product-groups-opt'] })
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
        <TextInput label="Loại" full placeholder="VD: Tip, Nozzle, Cổ cong… (để trống cũng được)"
          {...register('category')} />
        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">
            Nhóm hàng
          </label>
          <Controller name="product_category" control={control} render={({ field }) => (
            <SearchableSelect value={field.value ?? ''} onChange={field.onChange}
              options={categoryOptions} loading={groups.isLoading} allowCreate
              placeholder="Gõ tên nhóm có sẵn hoặc gõ tên mới rồi bấm + Dùng…" />
          )} />
          <p className="text-[11px] text-txt-2 mt-1">
            Để trống thì hàng ở trạng thái "chưa phân loại" — lọc theo Nhóm hàng ở Tồn kho sẽ không thấy.
            Gõ tên chưa có sẵn → hệ thống tự tạo nhóm mới luôn, không cần khai báo trước.
          </p>
        </div>
        <p className="text-[11px] text-txt-2 -mt-1">
          Thêm xong sẽ tự chọn vào dòng hàng ngay. Vào trang Danh mục sản phẩm để bổ sung giá bán/thuế đầy đủ sau.
        </p>
      </form>
    </Modal>
  )
}
