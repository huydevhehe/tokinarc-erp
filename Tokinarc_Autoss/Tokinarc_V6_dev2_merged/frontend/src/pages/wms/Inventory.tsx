/**
 * Tokinarc frontend — src/pages/wms/Inventory.tsx
 * Tồn kho THẬT (GET /wms/inventory/). Search + phân trang. Dùng chung cho cả
 * trang "Sắp hết hàng" qua prop lowStock.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Package, AlertTriangle, SlidersHorizontal, ArrowLeftRight, Layers, Download, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiError, api } from '@/lib/api'
import { downloadFile } from '@/lib/download'
import { fetchPage, fetchAll, fetchCount, PAGE_SIZE } from '@/lib/list'
import { useDebounced } from '@/lib/useDebounced'
import { formatVnd } from '@/lib/crm'
import { useAuth, isWmsControl } from '@/lib/auth/store'
import type { InventoryItem } from '@/lib/types'
import type { Option } from '@/components/form'
import {
  PageHeader, SearchInput, Tag, Button, TableCard, Th, Td, RowMsg, Pagination,
} from '@/components/ui'
import { AdjustForm } from '@/pages/wms/forms/AdjustForm'
import { TransferForm } from '@/pages/wms/forms/TransferForm'

interface BinLite { id: string; full_code: string }
interface CategoryRow { kind: 'part' | 'torch'; group: string; qty: number; value: number }
interface ProductGroupLite { id: number; name: string }
const KIND_LABEL: Record<CategoryRow['kind'], string> = { part: 'Phụ tùng', torch: 'Súng hàn' }

export function InventoryPage({ lowStock: initialLow = false }: { lowStock?: boolean }) {
  const qc = useQueryClient()
  const canControl = isWmsControl(useAuth((s) => s.user?.role))
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [lowStock, setLowStock] = useState(initialLow)
  const [groupView, setGroupView] = useState(false)
  const [groupFilter, setGroupFilter] = useState('')
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null)
  const [editMinId, setEditMinId] = useState<string | null>(null)
  const [minDraft, setMinDraft] = useState('')
  const debounced = useDebounced(search, 350, () => setPage(1))

  const grouped = useQuery({
    queryKey: ['wms-inventory-by-category', groupFilter],
    queryFn: async () => (await api.get<CategoryRow[]>('/wms/inventory/by-category/', {
      params: { group: groupFilter || undefined },
    })).data,
    enabled: groupView,
  })

  const productGroups = useQuery({
    queryKey: ['product-groups'],
    queryFn: async () => (await api.get<{ results: ProductGroupLite[] } | ProductGroupLite[]>('/catalog/product-groups/')).data,
    enabled: groupView,
  })
  const groupOptions: ProductGroupLite[] = Array.isArray(productGroups.data)
    ? productGroups.data
    : (productGroups.data?.results ?? [])

  const bins = useQuery({ queryKey: ['wms-bins-opt'], queryFn: () => fetchAll<BinLite>('/wms/bins/') })
  const binOptions: Option[] = (bins.data?.items ?? []).map((b) => ({ value: b.id, label: b.full_code }))
  const lowCount = useQuery({
    queryKey: ['wms-low-count'],
    queryFn: () => fetchCount('/wms/inventory/', { low_stock: 'true' }),
  })

  const setMinLevel = useMutation({
    mutationFn: (v: { id: string; min_level: number }) =>
      api.patch(`/wms/inventory/${v.id}/min-level/`, { min_level: v.min_level }),
    onSuccess: () => {
      toast.success('Đã cập nhật mức tối thiểu')
      setEditMinId(null)
      qc.invalidateQueries({ queryKey: ['wms-inventory'] })
      qc.invalidateQueries({ queryKey: ['wms-low-count'] })
    },
    onError: (e) => toast.error(apiError(e)),
  })
  const saveMinLevel = (id: string) => {
    const v = Number(minDraft)
    if (!Number.isFinite(v) || v < 0) { toast.error('Mức tối thiểu không hợp lệ'); return }
    setMinLevel.mutate({ id, min_level: v })
  }

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['wms-inventory', lowStock, debounced, page, pageSize],
    queryFn: () => fetchPage<InventoryItem>('/wms/inventory/', {
      search: debounced || undefined, page, page_size: pageSize,
      low_stock: lowStock ? 'true' : undefined,
    }),
    placeholderData: keepPreviousData,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1

  return (
    <div className="max-w-6xl">
      <PageHeader
        icon={<Package size={20} className="text-flame" />}
        title="Tồn kho"
        subtitle={
          groupView
            ? (grouped.data ? `${grouped.data.length} nhóm hàng` : undefined)
            : (data ? `${data.count} dòng tồn${lowStock ? ' · đang lọc sắp hết' : ''}` : undefined)
        }
        actions={
          <>
            <button onClick={() => setGroupView((v) => !v)}
              className={`flex items-center gap-1.5 text-xs rounded-md px-2.5 py-2 border transition-colors ${
                groupView ? 'border-flame text-flame bg-flame/10' : 'border-line text-txt-2 hover:text-txt'}`}>
              <Layers size={14} /> Xem theo nhóm hàng
            </button>
            {groupView && (
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}
                className="bg-ink-2 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame">
                <option value="">Tất cả nhóm SP</option>
                {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            <Button variant="ghost"
              onClick={() => {
                const g = groupOptions.find((o) => String(o.id) === groupFilter)
                const fname = g ? `ton_kho_${g.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx` : 'ton_kho_theo_nhom.xlsx'
                downloadFile(
                  `/wms/inventory/export-by-category/${groupFilter ? `?group=${groupFilter}` : ''}`, fname)
              }}>
              <Download size={14} /> Xuất Excel theo nhóm
            </Button>
            {!groupView && (
              <>
                <button onClick={() => { setLowStock((v) => !v); setPage(1) }}
                  className={`flex items-center gap-1.5 text-xs rounded-md px-2.5 py-2 border transition-colors ${
                    lowStock ? 'border-danger text-danger bg-danger/10' : 'border-line text-txt-2 hover:text-txt'}`}>
                  <AlertTriangle size={14} /> Chỉ sắp hết{lowCount.data ? ` (${lowCount.data})` : ''}
                </button>
                <SearchInput value={search} onChange={setSearch} placeholder="Tìm mặt hàng, vị trí…" />
              </>
            )}
          </>
        }
      />

      {groupView && (
        <TableCard>
          <thead>
            <tr className="border-b border-line">
              <Th>Loại</Th><Th>Nhóm hàng</Th>
              <Th className="text-right">Tồn (SL)</Th><Th className="text-right">Giá trị</Th>
            </tr>
          </thead>
          <tbody>
            {grouped.isLoading && <RowMsg colSpan={4}>Đang tải…</RowMsg>}
            {grouped.isError && <RowMsg colSpan={4} danger>Lỗi: {apiError(grouped.error)}</RowMsg>}
            {grouped.data?.length === 0 && <RowMsg colSpan={4}>Chưa có tồn kho.</RowMsg>}
            {grouped.data?.map((r, i) => (
              <tr key={`${r.kind}-${r.group}-${i}`} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
                <Td className="text-txt-2">{KIND_LABEL[r.kind]}</Td>
                <Td className="font-medium">{r.group}</Td>
                <Td className="text-right tabular-nums">{r.qty}</Td>
                <Td className="text-right tabular-nums text-flame">{formatVnd(r.value)}</Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {!groupView && (
      <TableCard>
        <thead>
          <tr className="border-b border-line">
            <Th>Mặt hàng</Th><Th>ĐVT</Th><Th className="text-right">Giá vốn</Th>
            <Th>Vị trí</Th><Th>Kho</Th>
            <Th className="text-right">Tồn</Th><Th className="text-right">Giữ</Th>
            <Th className="text-right">Khả dụng</Th><Th className="text-right">Tối thiểu</Th>
            <Th className="text-right">Thao tác</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <RowMsg colSpan={10}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={10} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data?.results.length === 0 && (
            <RowMsg colSpan={10}>{lowStock ? 'Không có mặt hàng sắp hết. 🎉' : 'Chưa có tồn kho.'}</RowMsg>
          )}
          {data?.results.map((i) => {
            const low = i.is_low
            return (
              <tr key={i.id} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
                <Td className="font-medium">{i.item_name}</Td>
                <Td className="text-txt-2">{i.unit || '—'}</Td>
                <Td className="text-right tabular-nums text-txt-2">{i.cost_vnd != null ? formatVnd(i.cost_vnd) : '—'}</Td>
                <Td className="font-mono text-txt-2">{i.bin_code}</Td>
                <Td className="text-txt-2">{i.warehouse_code}</Td>
                <Td className={`text-right tabular-nums ${low ? 'text-danger font-semibold' : ''}`}>{i.qty_on_hand}</Td>
                <Td className="text-right tabular-nums text-txt-2">{i.qty_reserved}</Td>
                <Td className="text-right tabular-nums">{i.qty_available}</Td>
                <Td className="text-right tabular-nums text-txt-2">
                  {editMinId === i.id ? (
                    <span className="inline-flex items-center gap-1">
                      <input type="number" min={0} autoFocus value={minDraft}
                        onChange={(e) => setMinDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveMinLevel(i.id)
                          if (e.key === 'Escape') setEditMinId(null)
                        }}
                        className="w-16 bg-ink-3 border border-line rounded px-1.5 py-0.5 text-sm text-right focus:border-flame focus:outline-none" />
                      <button title="Lưu" disabled={setMinLevel.isPending}
                        onClick={() => saveMinLevel(i.id)} className="text-ok hover:text-ok/80 p-0.5 disabled:opacity-40">
                        <Check size={13} />
                      </button>
                      <button title="Hủy" onClick={() => setEditMinId(null)} className="text-txt-2 hover:text-txt p-0.5">
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {i.min_level}{low && <Tag tone="danger"> thấp</Tag>}
                      {canControl && (
                        <button title="Sửa mức tối thiểu"
                          onClick={() => { setEditMinId(i.id); setMinDraft(String(i.min_level)) }}
                          className="text-txt-2 hover:text-flame p-0.5">
                          <Pencil size={11} />
                        </button>
                      )}
                    </span>
                  )}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" className="mr-1" title="Điều chỉnh tồn"
                    onClick={() => setAdjustItem(i)}><SlidersHorizontal size={13} /></Button>
                  <Button variant="ghost" size="sm" title="Chuyển kho"
                    onClick={() => setTransferItem(i)}><ArrowLeftRight size={13} /></Button>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </TableCard>
      )}

      {!groupView && data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      <AdjustForm open={!!adjustItem} onClose={() => setAdjustItem(null)} item={adjustItem} />
      <TransferForm open={!!transferItem} onClose={() => setTransferItem(null)} item={transferItem} binOptions={binOptions} />
    </div>
  )
}
