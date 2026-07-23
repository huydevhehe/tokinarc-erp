/**
 * Tokinarc frontend — src/pages/crm/Products.tsx
 * Tra cứu sản phẩm THẬT từ catalog (838 phụ tùng + 122 súng hàn).
 * 2 tab: Phụ tùng / Súng hàn — search + phân trang.
 *
 * Nhóm sản phẩm → Danh mục → Sản phẩm (quản lý được, #10 biên bản): thêm/sửa/
 * xoá Nhóm & Danh mục nằm ở trang riêng `/wms/product-groups` (nút "Quản lý
 * Nhóm/Danh mục" điều hướng sang đó); trang này chỉ lọc + gắn từng sản phẩm
 * vào Danh mục ngay trên bảng.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Wrench, Flame, Coins, Upload, FolderTree, Plus, Pencil, Trash2 } from 'lucide-react'
import { api, apiError } from '@/lib/api'
import { toast } from 'sonner'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { useDebounced } from '@/lib/useDebounced'
import { formatVnd } from '@/lib/crm'
import { useAuth, isManager } from '@/lib/auth/store'
import type { CatalogPart, CatalogTorch, ProductGroupNode } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { FieldRow, TextInput, SelectInput } from '@/components/form'
import { ImportModal } from '@/pages/crm/ImportModal'
import {
  PageHeader, SearchInput, Tag, TableCard, Th, Td, RowMsg, Pagination, Button,
} from '@/components/ui'

type TabKey = 'parts' | 'torches'

/** Quản lý Nhóm/Danh mục + gắn SP: Quản lý kho trở lên (khớp backend WMS_CONTROL). */
function useCanManageTaxonomy(): boolean {
  const role = useAuth((s) => s.user?.role)
  return role === 'wh_manager' || role === 'manager' || role === 'ceo'
}

export function ProductsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>('parts')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [importOpen, setImportOpen] = useState(false)
  const [groupFilter, setGroupFilter] = useState('')   // id Nhóm ('' = tất cả)
  const [catFilter, setCatFilter] = useState('')        // id Danh mục
  const [partFormOpen, setPartFormOpen] = useState(false)
  const [editingPart, setEditingPart] = useState<CatalogPart | null>(null)
  const [torchFormOpen, setTorchFormOpen] = useState(false)
  const [editingTorch, setEditingTorch] = useState<CatalogTorch | null>(null)
  const importRole = useAuth((s) => s.user?.role)
  const canImport = isManager(importRole) || importRole === 'warehouse' || importRole === 'wh_manager'
  const canManage = useCanManageTaxonomy()
  const debounced = useDebounced(search, 350, () => setPage(1))

  const openCreate = () => {
    if (tab === 'parts') { setEditingPart(null); setPartFormOpen(true) }
    else { setEditingTorch(null); setTorchFormOpen(true) }
  }
  const openEditPart = (p: CatalogPart) => { setEditingPart(p); setPartFormOpen(true) }
  const openEditTorch = (t: CatalogTorch) => { setEditingTorch(t); setTorchFormOpen(true) }

  const groups = useQuery({
    queryKey: ['product-groups'],
    queryFn: async () => (await api.get<{ results: ProductGroupNode[] } | ProductGroupNode[]>('/catalog/product-groups/')).data,
  })
  const groupList: ProductGroupNode[] = Array.isArray(groups.data)
    ? groups.data
    : (groups.data?.results ?? [])
  const currentGroup = groupList.find((g) => String(g.id) === groupFilter)

  const switchTab = (t: TabKey) => { setTab(t); setSearch(''); setPage(1) }

  return (
    <div className="max-w-6xl">
      <PageHeader
        icon={<Wrench size={20} className="text-flame" />}
        title="Sản phẩm"
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Tìm mã, tên sản phẩm…" />
            {tab === 'parts' && canManage && (
              <Button variant="ghost" onClick={() => navigate('/wms/product-groups')}>
                <FolderTree size={14} /> Quản lý Nhóm/Danh mục
              </Button>
            )}
            {tab === 'parts' && canImport && (
              <Button variant="ghost" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
            )}
            {canManage && (
              <Button onClick={openCreate}>
                <Plus size={14} /> Thêm {tab === 'parts' ? 'phụ tùng' : 'súng hàn'}
              </Button>
            )}
          </>
        }
      />

      <div className="flex gap-1 mb-4 border-b border-line">
        <TabBtn active={tab === 'parts'} onClick={() => switchTab('parts')} icon={<Wrench size={14} />}>Phụ tùng</TabBtn>
        <TabBtn active={tab === 'torches'} onClick={() => switchTab('torches')} icon={<Flame size={14} />}>Súng hàn</TabBtn>
      </div>

      {tab === 'parts' && (
        <div className="flex gap-2 mb-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-txt-2 font-semibold mb-1">
              Nhóm sản phẩm
            </label>
            <select value={groupFilter}
              onChange={(e) => { setGroupFilter(e.target.value); setCatFilter(''); setPage(1) }}
              className="bg-ink-3 border border-line rounded-md px-3 py-2 text-sm min-w-[220px]">
              <option value="">— Tất cả nhóm —</option>
              {groupList.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.part_count} SP)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-txt-2 font-semibold mb-1">
              Danh mục {currentGroup && <span className="normal-case text-txt-2/70">(trong {currentGroup.name})</span>}
            </label>
            <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1) }}
              disabled={!groupFilter}
              className="bg-ink-3 border border-line rounded-md px-3 py-2 text-sm min-w-[220px] disabled:opacity-50">
              <option value="">— Tất cả danh mục —</option>
              {currentGroup?.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.part_count})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {tab === 'parts'
        ? <PartsTable search={debounced} page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
            group={groupFilter} category={catFilter} groupList={groupList} canManage={canManage} onEdit={openEditPart} />
        : <TorchesTable search={debounced} page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
            canManage={canManage} onEdit={openEditTorch} />}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} spec={{
        title: 'Import danh mục phụ tùng (Kho)',
        importUrl: '/catalog/parts/import/',
        templateUrl: '/catalog/parts/import-template/',
        templateFilename: 'mau_import_phu_tung.xlsx',
        invalidateKey: 'catalog-parts',
        hint: 'Mỗi dòng = 1 phụ tùng. Trùng mã (tokin_part_no) sẽ CẬP NHẬT, không tạo trùng. Có thể tải thẳng file "Báo cáo tổng hợp Nhập Xuất Tồn" từ phần mềm kế toán lên đây — hệ thống tự nhận diện, tự tách tên/mã và lấy giá vốn, không cần chỉnh sửa file trước.',
      }} />

      <PartForm open={partFormOpen} editing={editingPart} onClose={() => { setPartFormOpen(false); setEditingPart(null) }} />
      <TorchForm open={torchFormOpen} editing={editingTorch} onClose={() => { setTorchFormOpen(false); setEditingTorch(null) }} />
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
        active ? 'border-flame text-flame font-semibold' : 'border-transparent text-txt-2 hover:text-txt'
      }`}>
      {icon}{children}
    </button>
  )
}

function PriceCell({ display, contact }: { display: string; contact: boolean }) {
  if (contact) return <Tag tone="purple">Liên hệ</Tag>
  return <span className="tabular-nums">{display || '—'}</span>
}

/** Dropdown gắn 1 sản phẩm vào Danh mục (option nhóm theo Nhóm). */
function AssignCell({ part, groupList }: { part: CatalogPart; groupList: ProductGroupNode[] }) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: async (catId: string) => {
      if (catId === '') {
        await api.post('/catalog/product-categories/unassign/', { part_nos: [part.tokin_part_no] })
      } else {
        await api.post(`/catalog/product-categories/${catId}/assign/`, { part_nos: [part.tokin_part_no] })
      }
    },
    onSuccess: () => {
      toast.success('Đã cập nhật phân loại')
      qc.invalidateQueries({ queryKey: ['catalog-parts'] })
      qc.invalidateQueries({ queryKey: ['product-groups'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })
  return (
    <select value={part.product_category ?? ''} disabled={m.isPending}
      onChange={(e) => m.mutate(e.target.value)}
      className="bg-ink-3 border border-line rounded-md px-2 py-1 text-xs max-w-[200px] focus:border-flame focus:outline-none">
      <option value="">— Chưa phân loại —</option>
      {groupList.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {g.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

function PartsTable({ search, page, setPage, pageSize, setPageSize, group, category, groupList, canManage, onEdit }: {
  search: string; page: number; setPage: (f: (p: number) => number) => void
  pageSize: number; setPageSize: (n: number) => void
  group?: string; category?: string; groupList: ProductGroupNode[]; canManage: boolean
  onEdit: (p: CatalogPart) => void
}) {
  const qc = useQueryClient()
  const canSeeCost = isManager(useAuth((s) => s.user?.role))
  const [costPart, setCostPart] = useState<string | null>(null)
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['catalog-parts', search, page, pageSize, group, category],
    queryFn: () => fetchPage<CatalogPart>('/catalog/parts/', {
      search: search || undefined, page, page_size: pageSize,
      product_category__group: group || undefined,
      product_category: category || undefined,
    }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1
  const deactivate = useMutation({
    mutationFn: (code: string) => api.patch(`/catalog/parts/${encodeURIComponent(code)}/`, { is_active: false }),
    onSuccess: () => { toast.success('Đã xoá phụ tùng'); qc.invalidateQueries({ queryKey: ['catalog-parts'] }) },
    onError: (e) => toast.error(apiError(e)),
  })
  // cột: Mã, Tên, Nhóm, Danh mục, [Gắn], Giá bán, Thuế, [Giá vốn], [Hành động]
  const cols = 6 + (canManage ? 2 : 0) + (canSeeCost ? 1 : 0)
  return (
    <>
      {data && <p className="text-xs text-txt-2 mb-2">{data.count} phụ tùng</p>}
      <TableCard>
        <thead><tr className="border-b border-line">
          <Th>Mã</Th><Th>Tên</Th><Th>Nhóm SP</Th><Th>Danh mục</Th>
          {canManage && <Th>Gắn danh mục</Th>}
          <Th className="text-right">Giá bán</Th>
          <Th className="text-right">Thuế</Th>
          {canSeeCost && <Th className="text-right">Giá vốn</Th>}
          {canManage && <Th className="text-right">Hành động</Th>}
        </tr></thead>
        <tbody>
          {isLoading && <RowMsg colSpan={cols}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={cols} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data?.results.length === 0 && <RowMsg colSpan={cols}>Không tìm thấy phụ tùng.</RowMsg>}
          {data?.results.map((p) => (
            <tr key={p.tokin_part_no} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
              <Td className="font-mono text-flame">{p.tokin_part_no}{p.is_priority_sell && <Tag tone="warn"> ưu tiên</Tag>}</Td>
              <Td className="font-medium">{p.display_name_vi || p.display_name_en || '—'}</Td>
              <Td className="text-txt-2">{p.group_name || '—'}</Td>
              <Td className="text-txt-2">{p.category_name || '—'}</Td>
              {canManage && <Td><AssignCell part={p} groupList={groupList} /></Td>}
              <Td className="text-right"><PriceCell display={p.price_display} contact={p.is_contact_price} /></Td>
              <Td className="text-right text-txt-2 tabular-nums">{p.tax_pct != null ? `${p.tax_pct}%` : '—'}</Td>
              {canSeeCost && (
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setCostPart(p.tokin_part_no)}>
                    <Coins size={13} /> Giá vốn
                  </Button>
                </Td>
              )}
              {canManage && (
                <Td className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" className="mr-1.5" onClick={() => onEdit(p)}>
                    <Pencil size={13} /> Sửa
                  </Button>
                  <Button variant="ghost" size="sm" className="!text-danger" disabled={deactivate.isPending}
                    onClick={() => {
                      if (confirm(`Xoá phụ tùng "${p.display_name_vi || p.tokin_part_no}"? Sản phẩm sẽ ẩn khỏi danh sách (dữ liệu nhập/xuất/bán cũ vẫn giữ nguyên).`)) {
                        deactivate.mutate(p.tokin_part_no)
                      }
                    }}>
                    <Trash2 size={13} /> Xoá
                  </Button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableCard>
      {data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(() => 1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}
      <CostModal partNo={costPart} open={!!costPart} onClose={() => setCostPart(null)} />
    </>
  )
}

interface CostData { part_no: string; name: string; cost_vnd: number | null; price_vnd: number; margin_vnd: number | null; margin_pct: number | null }

function CostModal({ partNo, open, onClose }: { partNo: string | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [cost, setCost] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['part-cost', partNo],
    queryFn: async () => (await api.get<CostData>(`/catalog/parts/${encodeURIComponent(partNo!)}/cost/`)).data,
    enabled: open && !!partNo,
  })
  useEffect(() => { if (data) setCost(data.cost_vnd != null ? String(data.cost_vnd) : '') }, [data])
  const save = useMutation({
    mutationFn: () => api.patch(`/catalog/parts/${encodeURIComponent(partNo!)}/cost/`,
      { cost_vnd: cost.trim() === '' ? null : Number(cost) }),
    onSuccess: () => {
      toast.success('Đã lưu giá vốn')
      qc.invalidateQueries({ queryKey: ['part-cost', partNo] })
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })
  return (
    <Modal open={open} onClose={onClose} title={`Giá vốn — ${partNo ?? ''}`}
      icon={<Coins size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Lưu</Button>
        </>
      }>
      {isLoading && <p className="text-sm text-txt-2">Đang tải…</p>}
      {data && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{data.name}</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Box label="Giá bán" value={formatVnd(data.price_vnd)} />
            <Box label="Lãi gộp" value={data.margin_vnd != null ? formatVnd(data.margin_vnd) : '—'}
              tone={data.margin_vnd != null && data.margin_vnd < 0 ? 'danger' : 'ok'} />
            <Box label="Biên LN" value={data.margin_pct != null ? `${data.margin_pct}%` : '—'}
              tone={data.margin_pct != null && data.margin_pct < 0 ? 'danger' : 'ok'} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-txt-2 font-semibold mb-1">
              Giá vốn (₫) — để trống nếu chưa có
            </label>
            <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)}
              className="w-full bg-ink-3 border border-line rounded-md px-3 py-2 text-sm focus:border-flame focus:outline-none" />
            <p className="text-[11px] text-txt-2 mt-1">
              Giá vốn tự cập nhật bình quân khi nhập kho theo Đơn mua. Chỉ chỉnh tay khi cần (tồn đầu kỳ…).
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Box({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'danger' }) {
  return (
    <div className="bg-ink-3 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-txt-2">{label}</div>
      <div className={`font-semibold tabular-nums ${tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-ok' : ''}`}>{value}</div>
    </div>
  )
}

interface PartFormValues {
  tokin_part_no: string; category: string; display_name_vi: string; display_name_en: string
  price_vnd: string; tax_pct: string; is_contact_price: boolean
}
const EMPTY_PART_FORM: PartFormValues = {
  tokin_part_no: '', category: '', display_name_vi: '', display_name_en: '',
  price_vnd: '', tax_pct: '', is_contact_price: false,
}

function PartForm({ open, editing, onClose }: {
  open: boolean; editing: CatalogPart | null; onClose: () => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PartFormValues>({ defaultValues: EMPTY_PART_FORM })

  useEffect(() => {
    if (!open) return
    reset(editing ? {
      tokin_part_no: editing.tokin_part_no, category: editing.category,
      display_name_vi: editing.display_name_vi, display_name_en: editing.display_name_en,
      price_vnd: editing.effective_price_vnd != null ? String(editing.effective_price_vnd) : '',
      tax_pct: editing.tax_pct != null ? String(editing.tax_pct) : '',
      is_contact_price: editing.is_contact_price,
    } : EMPTY_PART_FORM)
  }, [open, editing, reset])

  const save = useMutation({
    mutationFn: (d: PartFormValues) => {
      const payload = {
        tokin_part_no: d.tokin_part_no, category: d.category,
        display_name_vi: d.display_name_vi, display_name_en: d.display_name_en,
        price_vnd: d.price_vnd !== '' ? Number(d.price_vnd) : null,
        tax_pct: d.tax_pct !== '' ? Number(d.tax_pct) : null,
        is_contact_price: d.is_contact_price,
      }
      return editing
        ? api.patch(`/catalog/parts/${encodeURIComponent(editing.tokin_part_no)}/`, payload)
        : api.post('/catalog/parts/', payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Đã lưu phụ tùng' : 'Đã tạo phụ tùng')
      qc.invalidateQueries({ queryKey: ['catalog-parts'] })
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Sửa phụ tùng ${editing.tokin_part_no}` : 'Thêm phụ tùng'}
      icon={<Wrench size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit((d) => save.mutate(d))} disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </>
      }>
      <form onSubmit={handleSubmit((d) => save.mutate(d))}>
        <FieldRow>
          <TextInput label="Mã phụ tùng *" placeholder="VD: 002001" disabled={!!editing}
            error={errors.tokin_part_no?.message}
            {...register('tokin_part_no', { required: 'Bắt buộc' })} />
          <TextInput label="Loại *" placeholder="VD: Tip, Nozzle, Liner…"
            error={errors.category?.message}
            {...register('category', { required: 'Bắt buộc' })} />
        </FieldRow>
        <FieldRow>
          <TextInput label="Tên *" placeholder="Tên hiển thị tiếng Việt"
            error={errors.display_name_vi?.message}
            {...register('display_name_vi', { required: 'Bắt buộc' })} />
          <TextInput label="Tên tiếng Anh" placeholder="(tùy chọn)" {...register('display_name_en')} />
        </FieldRow>
        <FieldRow>
          <TextInput label="Giá bán (₫)" type="number" placeholder="0" {...register('price_vnd')} />
          <TextInput label="Thuế (%)" type="number" placeholder="VD: 8" {...register('tax_pct')} />
        </FieldRow>
        <label className="flex items-center gap-2 text-sm text-txt-2">
          <input type="checkbox" {...register('is_contact_price')} className="accent-flame" />
          Giá liên hệ (không hiện giá cụ thể)
        </label>
      </form>
    </Modal>
  )
}

function TorchesTable({ search, page, setPage, pageSize, setPageSize, canManage, onEdit }: {
  search: string; page: number; setPage: (f: (p: number) => number) => void
  pageSize: number; setPageSize: (n: number) => void
  canManage: boolean; onEdit: (t: CatalogTorch) => void
}) {
  const qc = useQueryClient()
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['catalog-torches', search, page, pageSize],
    queryFn: () => fetchPage<CatalogTorch>('/catalog/torches/', { search: search || undefined, page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1
  const deactivate = useMutation({
    mutationFn: (code: string) => api.patch(`/catalog/torches/${encodeURIComponent(code)}/`, { is_active: false }),
    onSuccess: () => { toast.success('Đã xoá súng hàn'); qc.invalidateQueries({ queryKey: ['catalog-torches'] }) },
    onError: (e) => toast.error(apiError(e)),
  })
  const cols = 6 + (canManage ? 1 : 0)
  return (
    <>
      {data && <p className="text-xs text-txt-2 mb-2">{data.count} súng hàn</p>}
      <TableCard>
        <thead><tr className="border-b border-line">
          <Th>Model</Th><Th>Tên</Th><Th>Dòng</Th><Th>Làm mát</Th><Th className="text-right">Dòng (A)</Th><Th className="text-right">Giá</Th>
          {canManage && <Th className="text-right">Hành động</Th>}
        </tr></thead>
        <tbody>
          {isLoading && <RowMsg colSpan={cols}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={cols} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data?.results.length === 0 && <RowMsg colSpan={cols}>Không tìm thấy súng hàn.</RowMsg>}
          {data?.results.map((t) => (
            <tr key={t.model_code} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
              <Td className="font-mono text-flame">{t.model_code}</Td>
              <Td className="font-medium">{t.display_name_vi || t.display_name_en || '—'}</Td>
              <Td className="text-txt-2">{t.family || '—'}</Td>
              <Td className="text-txt-2">{t.cooling === 'water' ? 'Nước' : t.cooling === 'air' ? 'Khí' : (t.cooling || '—')}</Td>
              <Td className="text-right tabular-nums text-txt-2">{t.rated_dc_a ?? '—'}</Td>
              <Td className="text-right"><PriceCell display={t.price_display} contact={t.is_contact_price} /></Td>
              {canManage && (
                <Td className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" className="mr-1.5" onClick={() => onEdit(t)}>
                    <Pencil size={13} /> Sửa
                  </Button>
                  <Button variant="ghost" size="sm" className="!text-danger" disabled={deactivate.isPending}
                    onClick={() => {
                      if (confirm(`Xoá súng hàn "${t.display_name_vi || t.model_code}"? Sản phẩm sẽ ẩn khỏi danh sách (dữ liệu nhập/xuất/bán cũ vẫn giữ nguyên).`)) {
                        deactivate.mutate(t.model_code)
                      }
                    }}>
                    <Trash2 size={13} /> Xoá
                  </Button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableCard>
      {data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(() => 1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}
    </>
  )
}

interface TorchFormValues {
  model_code: string; display_name_vi: string; display_name_en: string
  family: string; cooling: string; rated_dc_a: string; price_vnd: string; is_contact_price: boolean
}
const EMPTY_TORCH_FORM: TorchFormValues = {
  model_code: '', display_name_vi: '', display_name_en: '',
  family: '', cooling: '', rated_dc_a: '', price_vnd: '', is_contact_price: false,
}

function TorchForm({ open, editing, onClose }: {
  open: boolean; editing: CatalogTorch | null; onClose: () => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TorchFormValues>({ defaultValues: EMPTY_TORCH_FORM })

  useEffect(() => {
    if (!open) return
    reset(editing ? {
      model_code: editing.model_code, display_name_vi: editing.display_name_vi,
      display_name_en: editing.display_name_en, family: editing.family,
      cooling: editing.cooling, rated_dc_a: editing.rated_dc_a != null ? String(editing.rated_dc_a) : '',
      price_vnd: editing.effective_price_vnd != null ? String(editing.effective_price_vnd) : '',
      is_contact_price: editing.is_contact_price,
    } : EMPTY_TORCH_FORM)
  }, [open, editing, reset])

  const save = useMutation({
    mutationFn: (d: TorchFormValues) => {
      const payload = {
        model_code: d.model_code, display_name_vi: d.display_name_vi, display_name_en: d.display_name_en,
        family: d.family, cooling: d.cooling,
        rated_dc_a: d.rated_dc_a !== '' ? Number(d.rated_dc_a) : null,
        price_vnd: d.price_vnd !== '' ? Number(d.price_vnd) : null,
        is_contact_price: d.is_contact_price,
      }
      return editing
        ? api.patch(`/catalog/torches/${encodeURIComponent(editing.model_code)}/`, payload)
        : api.post('/catalog/torches/', payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Đã lưu súng hàn' : 'Đã tạo súng hàn')
      qc.invalidateQueries({ queryKey: ['catalog-torches'] })
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Sửa súng hàn ${editing.model_code}` : 'Thêm súng hàn'}
      icon={<Flame size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit((d) => save.mutate(d))} disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </>
      }>
      <form onSubmit={handleSubmit((d) => save.mutate(d))}>
        <FieldRow>
          <TextInput label="Model *" placeholder="VD: A-350R" disabled={!!editing}
            error={errors.model_code?.message}
            {...register('model_code', { required: 'Bắt buộc' })} />
          <TextInput label="Tên *" placeholder="Tên hiển thị tiếng Việt"
            error={errors.display_name_vi?.message}
            {...register('display_name_vi', { required: 'Bắt buộc' })} />
        </FieldRow>
        <FieldRow>
          <TextInput label="Tên tiếng Anh" placeholder="(tùy chọn)" {...register('display_name_en')} />
          <TextInput label="Dòng" placeholder="VD: A, ACC…" {...register('family')} />
        </FieldRow>
        <FieldRow>
          <SelectInput label="Làm mát" placeholder="— Chưa xác định —"
            options={[{ value: 'air', label: 'Khí' }, { value: 'water', label: 'Nước' }]}
            {...register('cooling')} />
          <TextInput label="Dòng điện (A)" type="number" placeholder="VD: 350" {...register('rated_dc_a')} />
        </FieldRow>
        <FieldRow>
          <TextInput label="Giá bán (₫)" type="number" placeholder="0" {...register('price_vnd')} />
        </FieldRow>
        <label className="flex items-center gap-2 text-sm text-txt-2">
          <input type="checkbox" {...register('is_contact_price')} className="accent-flame" />
          Giá liên hệ (không hiện giá cụ thể)
        </label>
      </form>
    </Modal>
  )
}
