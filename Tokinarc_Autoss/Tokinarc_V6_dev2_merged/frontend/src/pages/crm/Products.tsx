/**
 * Tokinarc frontend — src/pages/crm/Products.tsx
 * Tra cứu sản phẩm THẬT từ catalog (838 phụ tùng + 122 súng hàn).
 * 2 tab: Phụ tùng / Súng hàn — search + phân trang.
 *
 * Nhóm sản phẩm → Danh mục → Sản phẩm (quản lý được, #10 biên bản): Quản lý kho
 * tạo/sửa/xoá Nhóm & Danh mục (nút "Quản lý Nhóm/Danh mục"), gắn từng sản phẩm
 * vào Danh mục ngay trên bảng. Lọc theo Nhóm → Danh mục.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Wrench, Flame, Coins, Upload, FolderTree, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { api, apiError } from '@/lib/api'
import { toast } from 'sonner'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { useDebounced } from '@/lib/useDebounced'
import { formatVnd } from '@/lib/crm'
import { useAuth, isManager } from '@/lib/auth/store'
import type { CatalogPart, CatalogTorch, ProductGroupNode } from '@/lib/types'
import { Modal } from '@/components/Modal'
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
  const [tab, setTab] = useState<TabKey>('parts')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [importOpen, setImportOpen] = useState(false)
  const [taxOpen, setTaxOpen] = useState(false)
  const [groupFilter, setGroupFilter] = useState('')   // id Nhóm ('' = tất cả)
  const [catFilter, setCatFilter] = useState('')        // id Danh mục
  const importRole = useAuth((s) => s.user?.role)
  const canImport = isManager(importRole) || importRole === 'warehouse' || importRole === 'wh_manager'
  const canManage = useCanManageTaxonomy()
  const debounced = useDebounced(search, 350, () => setPage(1))

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
              <Button variant="ghost" onClick={() => setTaxOpen(true)}>
                <FolderTree size={14} /> Quản lý Nhóm/Danh mục
              </Button>
            )}
            {tab === 'parts' && canImport && (
              <Button variant="ghost" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
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
            group={groupFilter} category={catFilter} groupList={groupList} canManage={canManage} />
        : <TorchesTable search={debounced} page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} />}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} spec={{
        title: 'Import danh mục phụ tùng (Kho)',
        importUrl: '/catalog/parts/import/',
        templateUrl: '/catalog/parts/import-template/',
        templateFilename: 'mau_import_phu_tung.xlsx',
        invalidateKey: 'catalog-parts',
        hint: 'Mỗi dòng = 1 phụ tùng. Trùng mã (tokin_part_no) sẽ CẬP NHẬT, không tạo trùng. Có thể tải thẳng file "Báo cáo tổng hợp Nhập Xuất Tồn" từ phần mềm kế toán lên đây — hệ thống tự nhận diện, tự tách tên/mã và lấy giá vốn, không cần chỉnh sửa file trước.',
      }} />
      <TaxonomyModal open={taxOpen} onClose={() => setTaxOpen(false)} groups={groupList} />
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

function PartsTable({ search, page, setPage, pageSize, setPageSize, group, category, groupList, canManage }: {
  search: string; page: number; setPage: (f: (p: number) => number) => void
  pageSize: number; setPageSize: (n: number) => void
  group?: string; category?: string; groupList: ProductGroupNode[]; canManage: boolean
}) {
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
  // cột: Mã, Tên, Nhóm, Danh mục, [Gắn], Giá bán, Thuế, [Giá vốn]
  const cols = 6 + (canManage ? 1 : 0) + (canSeeCost ? 1 : 0)
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

// ─── Modal quản lý Nhóm / Danh mục (thêm/sửa/xoá) ────────────────────────────
function TaxonomyModal({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: ProductGroupNode[] }) {
  const qc = useQueryClient()
  const [newGroup, setNewGroup] = useState('')
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['product-groups'] })
    qc.invalidateQueries({ queryKey: ['catalog-parts'] })
  }
  const err = (e: unknown) => toast.error(apiError(e))

  const addGroup = useMutation({
    mutationFn: (name: string) => api.post('/catalog/product-groups/', { name }),
    onSuccess: () => { toast.success('Đã thêm nhóm'); setNewGroup(''); refresh() }, onError: err,
  })
  const renameGroup = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.patch(`/catalog/product-groups/${id}/`, { name }),
    onSuccess: () => { toast.success('Đã đổi tên nhóm'); refresh() }, onError: err,
  })
  const delGroup = useMutation({
    mutationFn: (id: number) => api.delete(`/catalog/product-groups/${id}/`),
    onSuccess: () => { toast.success('Đã xoá nhóm'); refresh() }, onError: err,
  })
  const addCat = useMutation({
    mutationFn: ({ group, name }: { group: number; name: string }) => api.post('/catalog/product-categories/', { group, name }),
    onSuccess: () => { toast.success('Đã thêm danh mục'); refresh() }, onError: err,
  })
  const renameCat = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.patch(`/catalog/product-categories/${id}/`, { name }),
    onSuccess: () => { toast.success('Đã đổi tên danh mục'); refresh() }, onError: err,
  })
  const delCat = useMutation({
    mutationFn: (id: number) => api.delete(`/catalog/product-categories/${id}/`),
    onSuccess: () => { toast.success('Đã xoá danh mục'); refresh() }, onError: err,
  })

  return (
    <Modal open={open} onClose={onClose} title="Quản lý Nhóm & Danh mục sản phẩm"
      icon={<FolderTree size={18} className="text-flame" />}
      footer={<Button variant="ghost" onClick={onClose}>Đóng</Button>}>
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        <div className="flex gap-2">
          <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)}
            placeholder="Tên nhóm mới…" onKeyDown={(e) => { if (e.key === 'Enter' && newGroup.trim()) addGroup.mutate(newGroup.trim()) }}
            className="flex-1 bg-ink-3 border border-line rounded-md px-3 py-2 text-sm focus:border-flame focus:outline-none" />
          <Button onClick={() => newGroup.trim() && addGroup.mutate(newGroup.trim())} disabled={addGroup.isPending}>
            <Plus size={14} /> Thêm nhóm
          </Button>
        </div>

        {groups.length === 0 && <p className="text-sm text-txt-2">Chưa có nhóm nào. Thêm nhóm đầu tiên ở trên.</p>}

        {groups.map((g) => (
          <div key={g.id} className="border border-line rounded-lg p-3">
            <EditableRow
              label={g.name} badge={`${g.category_count} danh mục · ${g.part_count} SP`}
              onRename={(name) => renameGroup.mutate({ id: g.id, name })}
              onDelete={() => { if (confirm(`Xoá nhóm "${g.name}"?`)) delGroup.mutate(g.id) }}
              strong />
            <div className="mt-2 pl-3 border-l border-line space-y-1.5">
              {g.categories.map((c) => (
                <EditableRow key={c.id} label={c.name} badge={`${c.part_count} SP`}
                  onRename={(name) => renameCat.mutate({ id: c.id, name })}
                  onDelete={() => { if (confirm(`Xoá danh mục "${c.name}"?`)) delCat.mutate(c.id) }} />
              ))}
              <AddCategoryRow onAdd={(name) => addCat.mutate({ group: g.id, name })} pending={addCat.isPending} />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function EditableRow({ label, badge, onRename, onDelete, strong }: {
  label: string; badge?: string; onRename: (name: string) => void; onDelete: () => void; strong?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(label)
  useEffect(() => { setVal(label) }, [label])
  const save = () => { const v = val.trim(); if (v && v !== label) onRename(v); setEditing(false) }
  return (
    <div className="flex items-center gap-2 text-sm">
      {editing ? (
        <>
          <input value={val} autoFocus onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(label); setEditing(false) } }}
            className="flex-1 bg-ink-3 border border-flame rounded px-2 py-1 focus:outline-none" />
          <button title="Lưu" onClick={save} className="text-ok hover:opacity-70"><Check size={15} /></button>
          <button title="Huỷ" onClick={() => { setVal(label); setEditing(false) }} className="text-txt-2 hover:text-txt"><X size={15} /></button>
        </>
      ) : (
        <>
          <span className={`flex-1 ${strong ? 'font-semibold text-flame' : ''}`}>{label}</span>
          {badge && <span className="text-[11px] text-txt-2">{badge}</span>}
          <button title="Đổi tên" onClick={() => setEditing(true)} className="text-txt-2 hover:text-flame"><Pencil size={13} /></button>
          <button title="Xoá" onClick={onDelete} className="text-txt-2 hover:text-danger"><Trash2 size={13} /></button>
        </>
      )}
    </div>
  )
}

function AddCategoryRow({ onAdd, pending }: { onAdd: (name: string) => void; pending: boolean }) {
  const [val, setVal] = useState('')
  const add = () => { const v = val.trim(); if (v) { onAdd(v); setVal('') } }
  return (
    <div className="flex items-center gap-2 pt-1">
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Thêm danh mục…"
        onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        className="flex-1 bg-ink-3 border border-line rounded px-2 py-1 text-xs focus:border-flame focus:outline-none" />
      <button onClick={add} disabled={pending} className="text-flame hover:opacity-70 disabled:opacity-40"><Plus size={15} /></button>
    </div>
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

function TorchesTable({ search, page, setPage, pageSize, setPageSize }: {
  search: string; page: number; setPage: (f: (p: number) => number) => void
  pageSize: number; setPageSize: (n: number) => void
}) {
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['catalog-torches', search, page, pageSize],
    queryFn: () => fetchPage<CatalogTorch>('/catalog/torches/', { search: search || undefined, page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1
  return (
    <>
      {data && <p className="text-xs text-txt-2 mb-2">{data.count} súng hàn</p>}
      <TableCard>
        <thead><tr className="border-b border-line">
          <Th>Model</Th><Th>Tên</Th><Th>Dòng</Th><Th>Làm mát</Th><Th className="text-right">Dòng (A)</Th><Th className="text-right">Giá</Th>
        </tr></thead>
        <tbody>
          {isLoading && <RowMsg colSpan={6}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={6} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data?.results.length === 0 && <RowMsg colSpan={6}>Không tìm thấy súng hàn.</RowMsg>}
          {data?.results.map((t) => (
            <tr key={t.model_code} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
              <Td className="font-mono text-flame">{t.model_code}</Td>
              <Td className="font-medium">{t.display_name_vi || t.display_name_en || '—'}</Td>
              <Td className="text-txt-2">{t.family || '—'}</Td>
              <Td className="text-txt-2">{t.cooling === 'water' ? 'Nước' : t.cooling === 'air' ? 'Khí' : (t.cooling || '—')}</Td>
              <Td className="text-right tabular-nums text-txt-2">{t.rated_dc_a ?? '—'}</Td>
              <Td className="text-right"><PriceCell display={t.price_display} contact={t.is_contact_price} /></Td>
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
