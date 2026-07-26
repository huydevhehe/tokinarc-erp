/**
 * Tokinarc frontend — src/pages/purchasing/Suppliers.tsx
 * Nhà cung cấp: danh sách + thêm/sửa/xóa. GET/POST/PATCH /purchasing/suppliers/.
 * "Xóa" = PATCH is_active=false (đổi trạng thái, không xóa row — xem SupplierViewSet.get_queryset).
 */
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Building, Loader2, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { useDebounced } from '@/lib/useDebounced'
import { Modal } from '@/components/Modal'
import { PageHeader, Button, Card, TableCard, Th, Td, RowMsg, Pagination } from '@/components/ui'
import { FieldRow, TextInput } from '@/components/form'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/lib/auth/store'
import { ImportModal } from '@/pages/crm/ImportModal'

interface Supplier {
  id: string; code: string; name: string; tax_code: string; phone: string; email: string
  address?: string; notes?: string
}
interface Form { name: string; tax_code: string; phone: string; email: string; address: string }

export function SuppliersPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [taxCode, setTaxCode] = useState('')
  const [phone, setPhone] = useState('')
  const dCode = useDebounced(code, 350, () => setPage(1))
  const dName = useDebounced(name, 350, () => setPage(1))
  const dTaxCode = useDebounced(taxCode, 350, () => setPage(1))
  const dPhone = useDebounced(phone, 350, () => setPage(1))
  // Sửa/Xóa/Import NCC: Quản lý kho trở lên (khớp backend PO_WRITE_ROLES).
  const role = useAuth((s) => s.user?.role)
  const canWrite = role === 'wh_manager' || role === 'manager' || role === 'ceo'
  const { register, handleSubmit, reset, watch, setValue } = useForm<Form>()
  const taxCodeInput = watch('tax_code')
  const dTaxCodeLookup = useDebounced(taxCodeInput, 600)
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle')

  // Gõ MST -> tự tra cứu tên/địa chỉ doanh nghiệp (API công khai, không cần key).
  // Chỉ chạy khi THÊM MỚI (sửa NCC có sẵn thì giữ nguyên dữ liệu đã lưu).
  // Điện thoại/Email nguồn này không có -> luôn để trống, tự gõ tay.
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
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['suppliers', dCode, dName, dTaxCode, dPhone, page, pageSize],
    queryFn: () => fetchPage<Supplier>('/purchasing/suppliers/', {
      code__icontains: dCode || undefined,
      name__icontains: dName || undefined,
      tax_code__icontains: dTaxCode || undefined,
      phone__icontains: dPhone || undefined,
      page, page_size: pageSize,
    }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1
  const save = useMutation({
    mutationFn: (d: Form) => editing
      ? api.patch(`/purchasing/suppliers/${editing.id}/`, d)
      : api.post('/purchasing/suppliers/', d),
    onSuccess: () => {
      toast.success(editing ? 'Đã lưu NCC' : 'Đã thêm NCC')
      qc.invalidateQueries({ queryKey: ['suppliers'] }); setOpen(false); setEditing(null); reset()
    },
    onError: (e) => toast.error(apiError(e)),
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => api.patch(`/purchasing/suppliers/${id}/`, { is_active: false }),
    onSuccess: () => { toast.success('Đã xoá NCC'); qc.invalidateQueries({ queryKey: ['suppliers'] }) },
    onError: (e) => toast.error(apiError(e)),
  })
  const openAdd = () => { setEditing(null); reset({ name: '', tax_code: '', phone: '', email: '', address: '' }); setLookup('idle'); setOpen(true) }
  const openEdit = (s: Supplier) => {
    setEditing(s)
    reset({ name: s.name, tax_code: s.tax_code, phone: s.phone, email: s.email, address: s.address || '' })
    setLookup('idle')
    setOpen(true)
  }

  return (
    <div className="max-w-4xl">
      <PageHeader icon={<Building size={20} className="text-flame" />} title="Nhà cung cấp"
        subtitle={data ? `${data.count} NCC` : undefined}
        actions={
          <>
            {canWrite && (
              <Button variant="ghost" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
            )}
            <Button onClick={openAdd}><Plus size={14} /> Thêm NCC</Button>
          </>
        } />
      <Card className="mb-4 !p-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { value: code, onChange: setCode, placeholder: 'Lọc theo mã…' },
            { value: name, onChange: setName, placeholder: 'Lọc theo tên…' },
            { value: taxCode, onChange: setTaxCode, placeholder: 'Lọc theo MST…' },
            { value: phone, onChange: setPhone, placeholder: 'Lọc theo điện thoại…' },
          ].map((f, i) => (
            <div key={i} className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-2" />
              <input value={f.value} onChange={(e) => f.onChange(e.target.value)} placeholder={f.placeholder}
                className="bg-ink-3 border border-line rounded-md pl-9 pr-3 py-2 text-sm w-full
                           focus:border-flame transition-colors" />
            </div>
          ))}
        </div>
      </Card>
      <TableCard>
        <thead><tr className="border-b border-line">
          <Th>Mã</Th><Th>Tên</Th><Th>MST</Th><Th>Điện thoại</Th>
          {canWrite && <Th className="text-right">Hành động</Th>}
        </tr></thead>
        <tbody>
          {isLoading && <RowMsg colSpan={canWrite ? 5 : 4}>Đang tải…</RowMsg>}
          {data?.results.length === 0 && <RowMsg colSpan={canWrite ? 5 : 4}>Chưa có NCC.</RowMsg>}
          {data?.results.map((s) => (
            <tr key={s.id} className="border-b border-line/50 last:border-0">
              <Td className="font-mono text-flame">{s.code}</Td><Td className="font-medium">{s.name}</Td>
              <Td className="text-txt-2">{s.tax_code || '—'}</Td><Td className="text-txt-2">{s.phone || '—'}</Td>
              {canWrite && (
                <Td className="text-right">
                  <span className="inline-flex gap-1.5 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                      <Pencil size={13} /> Sửa
                    </Button>
                    <Button variant="ghost" size="sm" disabled={deactivate.isPending} className="!text-danger"
                      onClick={() => {
                        if (confirm(`Xoá NCC "${s.name}"? NCC sẽ ngừng hoạt động (dữ liệu đơn mua cũ vẫn giữ nguyên).`)) {
                          deactivate.mutate(s.id)
                        }
                      }}>
                      <Trash2 size={13} /> Xoá
                    </Button>
                  </span>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableCard>
      {data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null) }}
        title={editing ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
        icon={<Building size={18} className="text-flame" />}
        footer={<><Button variant="ghost" onClick={() => { setOpen(false); setEditing(null) }}>Hủy</Button>
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

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} spec={{
        title: 'Import nhà cung cấp',
        importUrl: '/purchasing/suppliers/import/',
        templateUrl: '/purchasing/suppliers/import-template/',
        templateFilename: 'mau_import_nha_cung_cap.xlsx',
        invalidateKey: 'suppliers',
        hint: 'Mỗi dòng = 1 NCC. Bắt buộc cột "name" (tên). Có "code" trùng → cập nhật; thiếu code nhưng trùng "tax_code" (MST) → cập nhật NCC đó; còn lại tạo mới, tự sinh mã NCC-XXXX.',
      }} />
    </div>
  )
}
