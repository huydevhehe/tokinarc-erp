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
const KIND_LABEL: Record<CategoryRow['kind'], string> = { part: 'Phụ tùng', torch: 'Súng hàn' }

export function InventoryPage({ lowStock: initialLow = false }: { lowStock?: boolean }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [lowStock, setLowStock] = useState(initialLow)
  const [groupView, setGroupView] = useState(false)
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null)
  const debounced = useDebounced(search, 350, () => setPage(1))

  const grouped = useQuery({
    queryKey: ['wms-inventory-by-category'],
    queryFn: async () => (await api.get<CategoryRow[]>('/wms/inventory/by-category/')).data,
    enabled: groupView,
  })

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
            {groupView ? (
              <Button variant="ghost"
                onClick={() => downloadFile('/wms/inventory/export-by-category/', 'ton_kho_theo_nhom.xlsx')}>
                <Download size={14} /> Xuất Excel
              </Button>
            ) : (
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
            <Th>Mặt hàng</Th><Th>Vị trí</Th><Th>Kho</Th>
            <Th className="text-right">Tồn</Th><Th className="text-right">Giữ</Th>
            <Th className="text-right">Khả dụng</Th><Th className="text-right">Tối thiểu</Th>
            <Th className="text-right">Thao tác</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <RowMsg colSpan={8}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={8} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data?.results.length === 0 && (
            <RowMsg colSpan={8}>{lowStock ? 'Không có mặt hàng sắp hết. 🎉' : 'Chưa có tồn kho.'}</RowMsg>
          )}
          {data?.results.map((i) => {
            const low = i.qty_on_hand <= i.min_level
            return (
              <tr key={i.id} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
                <Td className="font-medium">{i.item_name}</Td>
                <Td className="font-mono text-txt-2">{i.bin_code}</Td>
                <Td className="text-txt-2">{i.warehouse_code}</Td>
                <Td className={`text-right tabular-nums ${low ? 'text-danger font-semibold' : ''}`}>{i.qty_on_hand}</Td>
                <Td className="text-right tabular-nums text-txt-2">{i.qty_reserved}</Td>
                <Td className="text-right tabular-nums">{i.qty_available}</Td>
                <Td className="text-right tabular-nums text-txt-2">
                  {i.min_level}{low && <Tag tone="danger"> thấp</Tag>}
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
