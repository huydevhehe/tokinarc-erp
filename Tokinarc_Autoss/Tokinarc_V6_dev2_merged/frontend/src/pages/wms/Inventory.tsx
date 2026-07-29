/**
 * Tokinarc frontend — src/pages/wms/Inventory.tsx
 * Tồn kho THẬT (GET /wms/inventory/). Search + phân trang. Dùng chung cho cả
 * trang "Sắp hết hàng" qua prop lowStock.
 */
import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Package, AlertTriangle, SlidersHorizontal, ArrowLeftRight, Layers, Download } from 'lucide-react'
import { apiError, api } from '@/lib/api'
import { downloadFile } from '@/lib/download'
import { fetchPage, fetchAll, fetchCount, PAGE_SIZE } from '@/lib/list'
import { useDebounced } from '@/lib/useDebounced'
import { formatVnd } from '@/lib/crm'
import type { InventoryItem } from '@/lib/types'
import type { Option } from '@/components/form'
import {
  PageHeader, SearchInput, Tag, Button, TableCard, Th, Td, RowMsg, Pagination,
} from '@/components/ui'
import { AdjustForm } from '@/pages/wms/forms/AdjustForm'
import { TransferForm } from '@/pages/wms/forms/TransferForm'

interface BinLite { id: string; full_code: string }
interface CategoryRow { kind: 'part' | 'torch'; group: string; qty: number; value: number }
// Khi chọn ĐÚNG 1 Nhóm cụ thể — danh sách từng mã trong nhóm đó (không phải
// số tổng gộp như CategoryRow, xem biên bản #25).
interface GroupItemRow { code: string; name: string; unit: string; qty: number; cost: number; value: number }
interface ProductGroupLite { id: number; name: string }
const KIND_LABEL: Record<CategoryRow['kind'], string> = { part: 'Phụ tùng', torch: 'Súng hàn' }

export function InventoryPage({ lowStock: initialLow = false }: { lowStock?: boolean }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [lowStock, setLowStock] = useState(initialLow)
  const [groupView, setGroupView] = useState(false)
  const [groupFilter, setGroupFilter] = useState('')
  // Chỉ dùng để GHI NHÃN mốc thời gian lên báo cáo xuất — tồn kho luôn là số
  // hiện tại, không có "sổ cái" để dựng lại đúng số của tháng/năm đã qua.
  const [reportMonth, setReportMonth] = useState('')
  const [reportYear, setReportYear] = useState('')
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null)
  const debounced = useDebounced(search, 350, () => setPage(1))

  // Không chọn nhóm → tổng quan gộp (CategoryRow); chọn đúng 1 Nhóm → danh sách
  // từng mã trong nhóm đó (GroupItemRow) — 2 hình dạng khác nhau tuỳ groupFilter.
  const grouped = useQuery({
    queryKey: ['wms-inventory-by-category', groupFilter],
    queryFn: async () => (await api.get<CategoryRow[] | GroupItemRow[]>('/wms/inventory/by-category/', {
      params: { group: groupFilter || undefined },
    })).data,
    enabled: groupView,
  })
  const groupItemRows = groupFilter ? (grouped.data as GroupItemRow[] | undefined) : undefined
  const categoryRows = !groupFilter ? (grouped.data as CategoryRow[] | undefined) : undefined

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
            ? (groupFilter
                ? (groupItemRows ? `${groupItemRows.length} mã hàng trong nhóm` : undefined)
                : (categoryRows ? `${categoryRows.length} nhóm hàng` : undefined))
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
              <select value={groupFilter}
                onChange={(e) => { setGroupFilter(e.target.value); if (!e.target.value) { setReportMonth(''); setReportYear('') } }}
                className="bg-ink-2 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame">
                <option value="">Tất cả nhóm SP</option>
                {groupOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            {groupView && groupFilter && (
              <>
                <select value={reportMonth} onChange={(e) => setReportMonth(e.target.value)}
                  title="Tháng (chỉ để ghi nhãn lên báo cáo — tồn kho luôn là số hiện tại)"
                  className="bg-ink-2 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame">
                  <option value="">— Tháng —</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>
                <select value={reportYear} onChange={(e) => setReportYear(e.target.value)}
                  title="Năm (chỉ để ghi nhãn lên báo cáo — tồn kho luôn là số hiện tại)"
                  className="bg-ink-2 border border-line rounded-md px-2.5 py-2 text-sm focus:border-flame">
                  <option value="">— Năm —</option>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>
              </>
            )}
            {groupView && (
              <Button variant="ghost"
                onClick={() => {
                  const g = groupOptions.find((o) => String(o.id) === groupFilter)
                  let fname = g ? `ton_kho_${g.name.replace(/[^a-zA-Z0-9_-]/g, '_')}` : 'ton_kho_theo_nhom'
                  if (groupFilter && reportYear) fname += `_${reportYear}${reportMonth ? `_${reportMonth.padStart(2, '0')}` : ''}`
                  else if (groupFilter && reportMonth) fname += `_thang${reportMonth}`
                  const params = new URLSearchParams()
                  if (groupFilter) params.set('group', groupFilter)
                  if (groupFilter && reportMonth) params.set('month', reportMonth)
                  if (groupFilter && reportYear) params.set('year', reportYear)
                  const qs = params.toString()
                  downloadFile(`/wms/inventory/export-by-category/${qs ? `?${qs}` : ''}`, `${fname}.xlsx`)
                }}>
                <Download size={14} /> Xuất Excel theo nhóm
              </Button>
            )}
            {!groupView && (
              <>
                <button onClick={() => { setLowStock((v) => !v); setPage(1) }}
                  className={`flex items-center gap-1.5 text-xs rounded-md px-2.5 py-2 border transition-colors ${
                    lowStock ? 'border-danger text-danger bg-danger/10' : 'border-line text-txt-2 hover:text-txt'}`}>
                  <AlertTriangle size={14} /> Chỉ sắp hết{lowCount.data ? ` (${lowCount.data})` : ''}
                </button>
                <SearchInput value={search} onChange={setSearch} placeholder="Tìm mặt hàng, vị trí…" />
                <Button variant="ghost"
                  onClick={() => {
                    const params = new URLSearchParams()
                    if (debounced) params.set('search', debounced)
                    if (lowStock) params.set('low_stock', 'true')
                    const qs = params.toString()
                    downloadFile(`/wms/inventory/export-xlsx/${qs ? `?${qs}` : ''}`, 'ton_kho.xlsx')
                  }}>
                  <Download size={14} /> Xuất Excel
                </Button>
              </>
            )}
          </>
        }
      />

      {groupView && groupFilter && (
        <TableCard>
          <thead>
            <tr className="border-b border-line">
              <Th>Mã số</Th><Th>Tên hàng hóa</Th><Th>ĐVT</Th>
              <Th className="text-right">Tồn (SL)</Th>
              <Th className="text-right">Giá vốn</Th><Th className="text-right">Giá trị</Th>
            </tr>
          </thead>
          <tbody>
            {grouped.isLoading && <RowMsg colSpan={6}>Đang tải…</RowMsg>}
            {grouped.isError && <RowMsg colSpan={6} danger>Lỗi: {apiError(grouped.error)}</RowMsg>}
            {groupItemRows?.length === 0 && <RowMsg colSpan={6}>Nhóm này chưa có mã hàng nào.</RowMsg>}
            {groupItemRows?.map((r) => (
              <tr key={r.code} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
                <Td className="font-mono text-flame">{r.code}</Td>
                <Td className="font-medium">{r.name}</Td>
                <Td className="text-txt-2">{r.unit}</Td>
                <Td className="text-right tabular-nums">{r.qty}</Td>
                <Td className="text-right tabular-nums text-txt-2">{formatVnd(r.cost)}</Td>
                <Td className="text-right tabular-nums text-flame">{formatVnd(r.value)}</Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {groupView && !groupFilter && (
        <TableCard>
          <thead>
            <tr className="border-b border-line">
              <Th>Loại / Nhóm hàng</Th>
              <Th className="text-right">Tồn (SL)</Th><Th className="text-right">Giá trị</Th>
            </tr>
          </thead>
          <tbody>
            {grouped.isLoading && <RowMsg colSpan={3}>Đang tải…</RowMsg>}
            {grouped.isError && <RowMsg colSpan={3} danger>Lỗi: {apiError(grouped.error)}</RowMsg>}
            {categoryRows?.length === 0 && <RowMsg colSpan={3}>Chưa có tồn kho.</RowMsg>}
            {categoryRows?.map((r, i) => {
              const unclassified = r.group === '(chưa phân loại)'
              return (
              <tr key={`${r.kind}-${r.group}-${i}`} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
                <Td className="font-medium">
                  {KIND_LABEL[r.kind]}
                  <span className="text-txt-2"> · </span>
                  {unclassified
                    ? <span className="text-warn">{r.group}</span>
                    : r.group}
                </Td>
                <Td className="text-right tabular-nums">{r.qty}</Td>
                <Td className="text-right tabular-nums text-flame">{formatVnd(r.value)}</Td>
              </tr>
            )})}
          </tbody>
        </TableCard>
      )}

      {!groupView && (
      <TableCard>
        <thead>
          <tr className="border-b border-line">
            <Th>Mã số</Th><Th>Tên hàng hóa</Th><Th>ĐVT</Th><Th className="text-right">Giá vốn</Th>
            <Th className="text-right">Tồn</Th><Th className="text-right">Giữ</Th>
            <Th className="text-right">Thao tác</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <RowMsg colSpan={7}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={7} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data?.results.length === 0 && (
            <RowMsg colSpan={7}>{lowStock ? 'Không có mặt hàng sắp hết. 🎉' : 'Chưa có tồn kho.'}</RowMsg>
          )}
          {data?.results.map((i) => {
            const low = i.is_low
            return (
              <tr key={i.id} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
                <Td className="font-mono text-flame">{i.part ?? i.torch ?? '—'}</Td>
                <Td className="font-medium">{i.display_name ?? i.item_name}</Td>
                <Td className="text-txt-2">{i.unit || '—'}</Td>
                <Td className="text-right tabular-nums text-txt-2">{i.cost_vnd != null ? formatVnd(i.cost_vnd) : '—'}</Td>
                <Td className={`text-right tabular-nums ${low ? 'text-danger font-semibold' : ''}`}>
                  {i.qty_on_hand}{low && <Tag tone="danger"> thấp</Tag>}
                </Td>
                <Td className="text-right tabular-nums text-txt-2">{i.qty_reserved}</Td>
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
