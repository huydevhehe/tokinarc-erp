/**
 * Tokinarc frontend — src/pages/purchasing/Suppliers.tsx
 * Nhà cung cấp: danh sách + thêm/sửa/xóa. GET/POST/PATCH /purchasing/suppliers/.
 * "Xóa" = PATCH is_active=false (đổi trạng thái, không xóa row — xem SupplierViewSet.get_queryset).
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Building, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { useDebounced } from '@/lib/useDebounced'
import { Modal } from '@/components/Modal'
import { PageHeader, Button, SearchInput, TableCard, Th, Td, RowMsg, Pagination } from '@/components/ui'
import { FieldRow, TextInput } from '@/components/form'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/lib/auth/store'
import { ImportModal } from '@/pages/crm/ImportModal'

interface Supplier {
  id: string; code: string; name: string; tax_code: string; phone: string; email: string
  address?: string; notes?: string
}
interface Form { code: string; name: string; tax_code: string; phone: string; email: string; address: string }

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
  const { register, handleSubmit, reset } = useForm<Form>()
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
  const openAdd = () => { setEditing(null); reset({ code: '', name: '', tax_code: '', phone: '', email: '', address: '' }); setOpen(true) }
  const openEdit = (s: Supplier) => {
    setEditing(s)
    reset({ code: s.code, name: s.name, tax_code: s.tax_code, phone: s.phone, email: s.email, address: s.address || '' })
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
      <div className="flex flex-wrap gap-2 mb-3">
        <SearchInput value={code} onChange={setCode} placeholder="Lọc theo mã…" />
        <SearchInput value={name} onChange={setName} placeholder="Lọc theo tên…" />
        <SearchInput value={taxCode} onChange={setTaxCode} placeholder="Lọc theo MST…" />
        <SearchInput value={phone} onChange={setPhone} placeholder="Lọc theo điện thoại…" />
      </div>
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
          <FieldRow>
            <TextInput label="Mã NCC *" placeholder="NCC-0001" {...register('code', { required: true })} />
            <TextInput label="Tên *" {...register('name', { required: true })} />
          </FieldRow>
          <FieldRow>
            <TextInput label="Mã số thuế" {...register('tax_code')} />
            <TextInput label="Điện thoại" {...register('phone')} />
          </FieldRow>
          <TextInput label="Email" full {...register('email')} />
          <TextInput label="Địa chỉ" full {...register('address')} />
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
