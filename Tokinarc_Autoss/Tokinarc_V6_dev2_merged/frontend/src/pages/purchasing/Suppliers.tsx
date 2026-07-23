/**
 * Tokinarc frontend — src/pages/purchasing/Suppliers.tsx
 * Nhà cung cấp: danh sách + thêm mới. GET/POST /purchasing/suppliers/.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Building, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { Modal } from '@/components/Modal'
import { PageHeader, Button, TableCard, Th, Td, RowMsg, Pagination } from '@/components/ui'
import { FieldRow, TextInput } from '@/components/form'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/lib/auth/store'
import { ImportModal } from '@/pages/crm/ImportModal'

interface Supplier { id: string; code: string; name: string; tax_code: string; phone: string; email: string }
interface Form { code: string; name: string; tax_code: string; phone: string; email: string; address: string }

export function SuppliersPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  // Import NCC: Quản lý kho trở lên (khớp backend PO_WRITE_ROLES).
  const role = useAuth((s) => s.user?.role)
  const canImport = role === 'wh_manager' || role === 'manager' || role === 'ceo'
  const { register, handleSubmit, reset } = useForm<Form>()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['suppliers', page, pageSize],
    queryFn: () => fetchPage<Supplier>('/purchasing/suppliers/', { page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1
  const save = useMutation({
    mutationFn: (d: Form) => api.post('/purchasing/suppliers/', d),
    onSuccess: () => { toast.success('Đã thêm NCC'); qc.invalidateQueries({ queryKey: ['suppliers'] }); setOpen(false); reset() },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <div className="max-w-4xl">
      <PageHeader icon={<Building size={20} className="text-flame" />} title="Nhà cung cấp"
        subtitle={data ? `${data.count} NCC` : undefined}
        actions={
          <>
            {canImport && (
              <Button variant="ghost" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
            )}
            <Button onClick={() => setOpen(true)}><Plus size={14} /> Thêm NCC</Button>
          </>
        } />
      <TableCard>
        <thead><tr className="border-b border-line"><Th>Mã</Th><Th>Tên</Th><Th>MST</Th><Th>Điện thoại</Th></tr></thead>
        <tbody>
          {isLoading && <RowMsg colSpan={4}>Đang tải…</RowMsg>}
          {data?.results.length === 0 && <RowMsg colSpan={4}>Chưa có NCC.</RowMsg>}
          {data?.results.map((s) => (
            <tr key={s.id} className="border-b border-line/50 last:border-0">
              <Td className="font-mono text-flame">{s.code}</Td><Td className="font-medium">{s.name}</Td>
              <Td className="text-txt-2">{s.tax_code || '—'}</Td><Td className="text-txt-2">{s.phone || '—'}</Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Thêm nhà cung cấp"
        icon={<Building size={18} className="text-flame" />}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
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
