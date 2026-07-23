/**
 * Tokinarc frontend — src/pages/wms/ProductTaxonomy.tsx
 * Quản lý Nhóm sản phẩm > Danh mục sản phẩm (#10 biên bản) — trang riêng
 * (trước đây là modal trong trang Sản phẩm), bố cục 2 cột cho dễ thao tác:
 * trái = Nhóm (chọn để xem/sửa), phải = Danh mục của nhóm đang chọn.
 * Ghi (thêm/sửa/xoá): Quản lý kho trở lên (khớp backend WMS_CONTROL_ROLES).
 */
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  FolderTree, Layers, Boxes, Package, ArrowLeft, Plus, Pencil, Trash2, Check, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import type { ProductGroupNode } from '@/lib/types'
import { PageHeader, Card, Button } from '@/components/ui'

export function ProductTaxonomyPage() {
  const qc = useQueryClient()
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [newGroup, setNewGroup] = useState('')
  const [newCat, setNewCat] = useState('')

  const groups = useQuery({
    queryKey: ['product-groups'],
    queryFn: async () =>
      (await api.get<{ results: ProductGroupNode[] } | ProductGroupNode[]>('/catalog/product-groups/')).data,
  })
  const groupList: ProductGroupNode[] = Array.isArray(groups.data) ? groups.data : (groups.data?.results ?? [])
  const selectedGroup = groupList.find((g) => g.id === selectedGroupId) ?? null

  // CHỈ tự chọn nhóm đầu tiên khi CHƯA có lựa chọn nào (lần đầu vào trang,
  // hoặc sau khi xoá nhóm đang chọn — xem delGroup bên dưới tự set về null).
  // KHÔNG "tự sửa lại" selectedGroupId đang có sẵn mỗi lần groupList đổi —
  // làm vậy tạo race: ngay sau khi tạo nhóm mới, groupList refetch xong
  // TRƯỚC khi setSelectedGroupId(id mới) kịp chạy → effect thấy id mới "chưa
  // có trong danh sách cũ" và ghi đè về nhóm đầu tiên (bug bắt được lúc verify
  // bằng Playwright: cột phải thỉnh thoảng không chuyển sang nhóm vừa tạo).
  useEffect(() => {
    if (selectedGroupId === null && groupList.length > 0) setSelectedGroupId(groupList[0].id)
  }, [groupList, selectedGroupId])

  const totalCategories = groupList.reduce((s, g) => s + g.category_count, 0)
  const totalClassified = groupList.reduce((s, g) => s + g.part_count, 0)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['product-groups'] })
    qc.invalidateQueries({ queryKey: ['catalog-parts'] })
  }
  const err = (e: unknown) => toast.error(apiError(e))

  const addGroup = useMutation({
    mutationFn: (name: string) => api.post('/catalog/product-groups/', { name }),
    onSuccess: (r) => { toast.success('Đã thêm nhóm'); setNewGroup(''); setSelectedGroupId(r.data.id); refresh() },
    onError: err,
  })
  const renameGroup = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.patch(`/catalog/product-groups/${id}/`, { name }),
    onSuccess: () => { toast.success('Đã đổi tên nhóm'); refresh() }, onError: err,
  })
  const delGroup = useMutation({
    mutationFn: (id: number) => api.delete(`/catalog/product-groups/${id}/`),
    onSuccess: (_r, id) => {
      toast.success('Đã xoá nhóm')
      // Nhóm đang chọn vừa bị xoá → về null để effect phía trên tự chọn lại
      // nhóm đầu tiên còn lại sau khi danh sách refetch xong.
      if (id === selectedGroupId) setSelectedGroupId(null)
      refresh()
    },
    onError: err,
  })
  const addCat = useMutation({
    mutationFn: ({ group, name }: { group: number; name: string }) => api.post('/catalog/product-categories/', { group, name }),
    onSuccess: () => { toast.success('Đã thêm danh mục'); setNewCat(''); refresh() }, onError: err,
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
    <div className="max-w-5xl">
      <PageHeader
        icon={<FolderTree size={20} className="text-flame" />}
        title="Nhóm & Danh mục sản phẩm"
        subtitle="Sắp xếp sản phẩm theo Nhóm → Danh mục để dễ tra cứu, đặt hàng, báo cáo tồn"
        actions={
          <Link to="/products">
            <Button variant="ghost"><ArrowLeft size={14} /> Về Danh mục sản phẩm</Button>
          </Link>
        }
      />

      {/* Thống kê tổng quan */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard icon={<Layers size={16} />} label="Nhóm sản phẩm" value={groupList.length} />
        <StatCard icon={<Boxes size={16} />} label="Danh mục" value={totalCategories} />
        <StatCard icon={<Package size={16} />} label="Sản phẩm đã phân loại" value={totalClassified} />
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
        {/* Cột trái: Nhóm sản phẩm */}
        <Card>
          <div className="text-xs font-semibold text-txt-2 uppercase tracking-wide mb-2">Nhóm sản phẩm</div>
          <div className="flex gap-1.5 mb-3">
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Thêm nhóm mới…"
              onKeyDown={(e) => { if (e.key === 'Enter' && newGroup.trim()) addGroup.mutate(newGroup.trim()) }}
              className="flex-1 bg-ink-3 border border-line rounded-md px-2.5 py-1.5 text-sm focus:border-flame focus:outline-none" />
            <button title="Thêm nhóm" disabled={addGroup.isPending || !newGroup.trim()}
              onClick={() => newGroup.trim() && addGroup.mutate(newGroup.trim())}
              className="shrink-0 text-flame hover:opacity-70 disabled:opacity-30 px-1">
              <Plus size={18} />
            </button>
          </div>

          {groups.isLoading && <p className="text-sm text-txt-2">Đang tải…</p>}
          {groupList.length === 0 && !groups.isLoading && (
            <p className="text-sm text-txt-2">Chưa có nhóm nào — thêm nhóm đầu tiên ở trên.</p>
          )}

          <div className="space-y-1">
            {groupList.map((g) => (
              <GroupRow key={g.id} group={g} active={g.id === selectedGroupId}
                onSelect={() => setSelectedGroupId(g.id)}
                onRename={(name) => renameGroup.mutate({ id: g.id, name })}
                onDelete={() => { if (confirm(`Xoá nhóm "${g.name}"? Chỉ xoá được khi không còn danh mục bên trong.`)) delGroup.mutate(g.id) }} />
            ))}
          </div>
        </Card>

        {/* Cột phải: Danh mục của nhóm đang chọn */}
        <Card>
          {!selectedGroup ? (
            <p className="text-sm text-txt-2">← Chọn 1 nhóm bên trái để xem/sửa danh mục bên trong.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs font-semibold text-txt-2 uppercase tracking-wide">Danh mục</div>
                  <div className="text-flame font-semibold">{selectedGroup.name}</div>
                </div>
                <span className="text-xs text-txt-2">
                  {selectedGroup.category_count} danh mục · {selectedGroup.part_count} sản phẩm
                </span>
              </div>

              <div className="flex gap-1.5 mb-3">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)}
                  placeholder={`Thêm danh mục vào "${selectedGroup.name}"…`}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newCat.trim()) addCat.mutate({ group: selectedGroup.id, name: newCat.trim() }) }}
                  className="flex-1 bg-ink-3 border border-line rounded-md px-2.5 py-1.5 text-sm focus:border-flame focus:outline-none" />
                <button title="Thêm danh mục" disabled={addCat.isPending || !newCat.trim()}
                  onClick={() => newCat.trim() && addCat.mutate({ group: selectedGroup.id, name: newCat.trim() })}
                  className="shrink-0 text-flame hover:opacity-70 disabled:opacity-30 px-1">
                  <Plus size={18} />
                </button>
              </div>

              {selectedGroup.categories.length === 0 && (
                <p className="text-sm text-txt-2">Nhóm này chưa có danh mục nào — thêm danh mục đầu tiên ở trên.</p>
              )}

              <div className="space-y-1">
                {selectedGroup.categories.map((c) => (
                  <CategoryRow key={c.id} name={c.name} partCount={c.part_count}
                    onRename={(name) => renameCat.mutate({ id: c.id, name })}
                    onDelete={() => { if (confirm(`Xoá danh mục "${c.name}"? Chỉ xoá được khi không còn sản phẩm gắn vào.`)) delCat.mutate(c.id) }} />
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <p className="text-xs text-txt-2 mt-4">
        Gắn sản phẩm vào danh mục: quay lại trang <Link to="/products" className="text-flame hover:underline">Danh mục sản phẩm</Link>,
        dùng ô "Gắn danh mục" ngay trên bảng sản phẩm.
      </p>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-txt-2 text-xs mb-1">{icon} {label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  )
}

function GroupRow({ group, active, onSelect, onRename, onDelete }: {
  group: ProductGroupNode; active: boolean; onSelect: () => void
  onRename: (name: string) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(group.name)
  useEffect(() => { setVal(group.name) }, [group.name])
  const save = () => { const v = val.trim(); if (v && v !== group.name) onRename(v); setEditing(false) }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-flame">
        <input value={val} autoFocus onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(group.name); setEditing(false) } }}
          className="flex-1 bg-transparent text-sm focus:outline-none" />
        <button title="Lưu" onClick={save} className="text-ok hover:opacity-70"><Check size={14} /></button>
        <button title="Huỷ" onClick={() => { setVal(group.name); setEditing(false) }} className="text-txt-2 hover:text-txt"><X size={14} /></button>
      </div>
    )
  }
  return (
    <div className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
      active ? 'bg-flame/10 border border-flame/40' : 'border border-transparent hover:bg-ink-3/60'
    }`} onClick={onSelect}>
      <span className={`flex-1 text-sm truncate ${active ? 'text-flame font-semibold' : ''}`}>{group.name}</span>
      <span className="text-[11px] text-txt-2 shrink-0">{group.part_count} SP</span>
      <button title="Đổi tên" onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="text-txt-2 hover:text-flame opacity-0 group-hover:opacity-100 shrink-0"><Pencil size={12} /></button>
      <button title="Xoá" onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="text-txt-2 hover:text-danger opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={12} /></button>
    </div>
  )
}

function CategoryRow({ name, partCount, onRename, onDelete }: {
  name: string; partCount: number; onRename: (name: string) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  useEffect(() => { setVal(name) }, [name])
  const save = () => { const v = val.trim(); if (v && v !== name) onRename(v); setEditing(false) }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-line text-sm">
      {editing ? (
        <>
          <input value={val} autoFocus onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(name); setEditing(false) } }}
            className="flex-1 bg-transparent focus:outline-none" />
          <button title="Lưu" onClick={save} className="text-ok hover:opacity-70"><Check size={14} /></button>
          <button title="Huỷ" onClick={() => { setVal(name); setEditing(false) }} className="text-txt-2 hover:text-txt"><X size={14} /></button>
        </>
      ) : (
        <>
          <span className="flex-1">{name}</span>
          <span className="text-[11px] text-txt-2">{partCount} SP</span>
          <button title="Đổi tên" onClick={() => setEditing(true)} className="text-txt-2 hover:text-flame"><Pencil size={13} /></button>
          <button title="Xoá" onClick={onDelete} className="text-txt-2 hover:text-danger"><Trash2 size={13} /></button>
        </>
      )}
    </div>
  )
}
