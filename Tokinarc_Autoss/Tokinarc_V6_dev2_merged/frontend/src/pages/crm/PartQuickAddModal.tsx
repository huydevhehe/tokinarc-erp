/**
 * Tokinarc frontend — src/pages/crm/PartQuickAddModal.tsx
 * Thêm nhanh 1 Phụ tùng mới vào danh mục — dùng khi đang tạo phiếu nhập kho mà
 * gõ tên hàng không tìm thấy (NV kho trở lên, khớp PartTorchWritePermission
 * backend — action 'create' mở cho NV kho, sửa/xóa vẫn cần Quản lý kho trở lên).
 * Chỉ các trường tối thiểu; sửa đầy đủ (giá bán, thuế…) vẫn làm ở trang Danh
 * mục sản phẩm.
 */
import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackagePlus, Plus } from 'lucide-react'
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

export function PartQuickAddModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void
  /** Gọi sau khi thêm thành công — nơi gọi tự chọn mặt hàng mới vào dòng hàng. */
  onSaved?: (p: NewPart) => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<Form>()
  const [addCatOpen, setAddCatOpen] = useState(false)

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
    if (open) reset({ tokin_part_no: '', category: '', display_name_vi: '', product_category: '' })
  }, [open, reset])

  const save = useMutation({
    mutationFn: (d: Form) => api.post<NewPart>('/catalog/parts/', {
      ...d, product_category: d.product_category || null,
    }),
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
    <>
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
        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">
            Nhóm hàng
          </label>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <Controller name="product_category" control={control} render={({ field }) => (
                <SearchableSelect value={field.value ?? ''} onChange={field.onChange}
                  options={categoryOptions} loading={groups.isLoading}
                  placeholder="— Chưa phân loại — (VD: Tokinarc, OTC, Binzel…)" />
              )} />
            </div>
            <Button type="button" variant="ghost" onClick={() => setAddCatOpen(true)} aria-label="Thêm nhóm hàng mới">
              <Plus size={15} />
            </Button>
          </div>
          <p className="text-[11px] text-txt-2 mt-1">
            Để trống thì hàng sẽ ở trạng thái "chưa phân loại" — lọc theo Nhóm hàng ở Tồn kho sẽ không thấy.
            Không thấy nhóm cần dùng? Bấm "+" để tự đặt tên Nhóm/Danh mục mới theo cách sắp xếp của kho
            (sửa/xóa các nhóm có sẵn ở trang "Nhóm & Danh mục SP").
          </p>
        </div>
        <p className="text-[11px] text-txt-2 -mt-1">
          Thêm xong sẽ tự chọn vào dòng hàng ngay. Vào trang Danh mục sản phẩm để bổ sung giá bán/thuế đầy đủ sau.
        </p>
      </form>
    </Modal>

    <QuickAddCategoryModal open={addCatOpen} onClose={() => setAddCatOpen(false)} groupList={groupList}
      onCreated={(categoryId) => setValue('product_category', categoryId, { shouldValidate: true })} />
    </>
  )
}

function QuickAddCategoryModal({ open, onClose, groupList, onCreated }: {
  open: boolean; onClose: () => void; groupList: ProductGroupLite[]
  onCreated: (categoryId: string) => void
}) {
  const qc = useQueryClient()
  const [groupValue, setGroupValue] = useState('')
  const [catName, setCatName] = useState('')

  useEffect(() => {
    if (open) { setGroupValue(''); setCatName('') }
  }, [open])

  const groupOptions = groupList.map((g) => ({ value: String(g.id), label: g.name }))

  const save = useMutation({
    mutationFn: async () => {
      const existing = groupList.find((g) => String(g.id) === groupValue)
      let groupId = existing?.id
      if (!groupId) {
        if (!groupValue.trim()) throw new Error('Chọn hoặc gõ tên Nhóm')
        const r = await api.post<{ id: number }>('/catalog/product-groups/', { name: groupValue.trim() })
        groupId = r.data.id
      }
      const rc = await api.post<{ id: number }>('/catalog/product-categories/', { group: groupId, name: catName.trim() })
      return rc.data.id
    },
    onSuccess: (id) => {
      toast.success('Đã thêm Nhóm hàng mới')
      qc.invalidateQueries({ queryKey: ['product-groups-opt'] })
      onCreated(String(id))
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title="Thêm Nhóm hàng mới"
      icon={<PackagePlus size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !groupValue.trim() || !catName.trim()}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </>
      }>
      <div className="mb-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-txt-2 mb-1">Nhóm *</label>
        <SearchableSelect value={groupValue} onChange={setGroupValue} options={groupOptions}
          allowCreate placeholder="Chọn nhóm có sẵn hoặc gõ tên nhóm mới…" />
      </div>
      <TextInput label="Danh mục *" full placeholder="VD: Đầu tum, Vật tư tiêu hao…"
        value={catName} onChange={(e) => setCatName(e.target.value)} />
      <p className="text-[11px] text-txt-2 -mt-1">
        Ví dụ: Nhóm "Tokinarc" → Danh mục "Đầu tum" — gõ theo cách kho tự sắp xếp, không bắt buộc theo tên có sẵn.
      </p>
    </Modal>
  )
}
