/**
 * Tokinarc frontend — src/pages/crm/Contracts.tsx
 * Hợp đồng THẬT (GET /crm/contracts/) + KPI + xem/sửa + DUYỆT 2 CẤP + xuất Word.
 *   - Cấp 1 → POST /crm/contracts/{id}/approve/      (manager+)  · vượt ngưỡng → chờ CEO
 *   - Cấp 2 → POST /crm/contracts/{id}/approve-l2/   (CEO/admin)
 *   - Từ chối → POST /crm/contracts/{id}/reject/
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ScrollText, Plus, Upload, Download, Eye, Pencil, Check, ShieldCheck, X, ShoppingCart, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { downloadFile } from '@/lib/download'
import { fetchAll, fetchPage, PAGE_SIZE } from '@/lib/list'
import { compactVnd, formatDate, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE } from '@/lib/crm'
import type { Contract } from '@/lib/types'
import {
  PageHeader, StatCard, Button, Tag, TableCard, Th, Td, RowMsg, Pagination,
} from '@/components/ui'
import { useAuth, isManager, isCeo } from '@/lib/auth/store'
import { useCan } from '@/lib/auth/capabilities'
import { ContractForm } from '@/pages/crm/forms/ContractForm'
import { ContractDetailModal } from '@/pages/crm/ContractDetailModal'
import { ImportModal } from '@/pages/crm/ImportModal'

export function ContractsPage() {
  const qc = useQueryClient()
  const role = useAuth((s) => s.user?.role)
  const myId = useAuth((s) => s.user?.id)
  const canManage = isManager(role)
  const canApproveL2 = isCeo(role)
  // Giai đoạn 1 phân quyền function-based: mặc định chỉ admin, hoặc chủ hợp đồng.
  const canDeleteAny = useCan('crm.contract.delete')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [detail, setDetail] = useState<Contract | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)

  // KPI (đếm/tổng giá trị) cần TOÀN BỘ dữ liệu, tách khỏi bảng có phân trang riêng.
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['contracts-all'],
    queryFn: () => fetchAll<Contract>('/crm/contracts/'),
  })
  const statItems = stats?.items ?? []
  const count = (s: string) => statItems.filter((c) => c.status === s).length
  const totalValue = statItems.reduce((s, c) => s + Number(c.value_vnd || 0), 0)

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['contracts', page, pageSize],
    queryFn: () => fetchPage<Contract>('/crm/contracts/', { page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  })
  const items = data?.results ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] })
    qc.invalidateQueries({ queryKey: ['contracts-all'] })
  }

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/crm/contracts/${id}/approve/`),
    onSuccess: (res) => {
      toast.success(res.data.status === 'pending_ceo'
        ? 'Đã duyệt cấp 1 — chuyển CEO duyệt cấp 2' : 'Đã duyệt hợp đồng')
      invalidate()
    },
    onError: (e) => toast.error(apiError(e)),
  })
  const approveL2 = useMutation({
    mutationFn: (id: string) => api.post(`/crm/contracts/${id}/approve-l2/`),
    onSuccess: () => { toast.success('CEO đã duyệt cấp 2'); invalidate() },
    onError: (e) => toast.error(apiError(e)),
  })
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.post(`/crm/contracts/${v.id}/reject/`, { reason: v.reason }),
    onSuccess: () => { toast.success('Đã từ chối hợp đồng'); invalidate() },
    onError: (e) => toast.error(apiError(e)),
  })
  const onReject = (id: string) => {
    const reason = window.prompt('Lý do từ chối hợp đồng?') ?? ''
    if (reason !== null) reject.mutate({ id, reason })
  }

  // HĐ đã ký → tạo đơn giao hàng đợt này (1 HĐ có thể tạo nhiều đơn theo từng đợt).
  const toOrder = useMutation({
    mutationFn: (id: string) => api.post(`/crm/contracts/${id}/to-order/`),
    onSuccess: (res) => { toast.success(`Đã tạo đơn ${res.data.order_code}`); invalidate() },
    onError: (e) => toast.error(apiError(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/contracts/${id}/`),
    onSuccess: () => { toast.success('Đã xoá hợp đồng'); invalidate() },
    onError: (e) => toast.error(apiError(e)),
  })
  const onDelete = (c: Contract) => {
    if (window.confirm(`Xoá hợp đồng ${c.code}? Có thể khôi phục qua quản trị nếu cần.`)) remove.mutate(c.id)
  }

  return (
    <div className="max-w-6xl">
      <PageHeader icon={<ScrollText size={20} className="text-flame" />} title="Hợp đồng"
        subtitle={data ? `${data.count} hợp đồng` : undefined}
        actions={
          <>
            {canManage && (
              <Button variant="ghost" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
            )}
            <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={14} /> Tạo HĐ</Button>
          </>
        } />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Hiệu lực" tone="ok" value={statsLoading ? '…' : count('active')} />
        <StatCard label="Chờ ký" tone="warn" value={statsLoading ? '…' : count('pending_sign')} />
        <StatCard label="Hết hạn" tone="danger" value={statsLoading ? '…' : count('expired')} />
        <StatCard label="Tổng giá trị" tone="flame" value={statsLoading ? '…' : compactVnd(totalValue)} />
      </div>

      <TableCard>
        <thead><tr className="border-b border-line">
          <Th>Mã HĐ</Th><Th>Khách hàng</Th><Th className="text-right">Giá trị</Th>
          <Th>Hiệu lực</Th><Th>Trạng thái</Th><Th className="text-right">Hành động</Th>
        </tr></thead>
        <tbody>
          {isLoading && <RowMsg colSpan={6}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={6} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data && items.length === 0 && <RowMsg colSpan={6}>Chưa có hợp đồng nào.</RowMsg>}
          {items.map((c) => (
            <tr key={c.id} onClick={() => setDetail(c)}
              className="border-b border-line/50 last:border-0 hover:bg-ink-3/40 cursor-pointer">
              <Td className="font-mono text-flame">{c.code}</Td>
              <Td className="font-medium">{c.customer_name}</Td>
              <Td className="text-right tabular-nums">{compactVnd(c.value_vnd)}</Td>
              <Td className="text-txt-2 text-xs">{c.start_date ? `${formatDate(c.start_date)} – ${formatDate(c.end_date)}` : 'chưa ký'}</Td>
              <Td><Tag tone={CONTRACT_STATUS_TONE[c.status]}>{CONTRACT_STATUS_LABEL[c.status]}</Tag></Td>
              <Td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="mr-1" onClick={() => setDetail(c)}>
                  <Eye size={13} /> Xem
                </Button>
                {c.status === 'draft' && (
                  <Button variant="ghost" size="sm" className="mr-1" onClick={() => { setEditing(c); setFormOpen(true) }}>
                    <Pencil size={13} /> Sửa
                  </Button>
                )}
                {/* Duyệt cấp 1 (manager+) */}
                {c.status === 'draft' && canManage && (
                  <>
                    <Button variant="success" size="sm" className="mr-1"
                      disabled={approve.isPending && approve.variables === c.id}
                      onClick={() => approve.mutate(c.id)}>
                      <Check size={13} /> Duyệt{c.requires_l2 ? ' (cấp 1)' : ''}
                    </Button>
                    <Button variant="ghost" size="sm" className="mr-1" onClick={() => onReject(c.id)}><X size={13} /> Từ chối</Button>
                  </>
                )}
                {/* Duyệt cấp 2 (CEO) */}
                {c.status === 'pending_ceo' && canApproveL2 && (
                  <Button variant="success" size="sm" className="mr-1"
                    disabled={approveL2.isPending && approveL2.variables === c.id}
                    onClick={() => approveL2.mutate(c.id)}>
                    <ShieldCheck size={13} /> Duyệt cấp 2 (CEO)
                  </Button>
                )}
                {c.status === 'pending_ceo' && !canApproveL2 && (
                  <span className="text-[11px] text-txt-2 mr-1">Chờ CEO duyệt</span>
                )}
                {/* Đã ký (Hiệu lực) → tạo đơn giao hàng đợt này, từ dòng hàng báo giá gốc. */}
                {c.status === 'active' && canManage && (
                  <Button variant="ghost" size="sm" className="mr-1"
                    disabled={!c.quote || (toOrder.isPending && toOrder.variables === c.id)}
                    title={c.quote ? 'Tạo đơn giao hàng cho đợt này' : 'Hợp đồng không có báo giá gốc — không tự lấy được dòng hàng'}
                    onClick={() => toOrder.mutate(c.id)}>
                    <ShoppingCart size={13} /> Tạo đơn
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="mr-1"
                  onClick={() => downloadFile(`/crm/contracts/${c.id}/export-docx/`, `hop_dong_${c.code}.docx`)}>
                  <Download size={13} /> Word
                </Button>
                {(canDeleteAny || c.owner === myId) && (
                  <Button variant="ghost" size="sm" disabled={remove.isPending && remove.variables === c.id}
                    onClick={() => onDelete(c)}>
                    <Trash2 size={13} /> Xoá
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      {data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      <ContractForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      <ContractDetailModal contract={detail} open={!!detail} onClose={() => setDetail(null)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} spec={{
        title: 'Import Hợp đồng cũ',
        importUrl: '/crm/import/contracts/',
        templateUrl: '/crm/import/contracts/template/',
        templateFilename: 'mau_import_hop_dong.xlsx',
        invalidateKey: 'contracts',
        hint: 'Cột customer_code = mã KH đã có. Trùng mã HĐ sẽ bỏ qua.',
      }} />
    </div>
  )
}
