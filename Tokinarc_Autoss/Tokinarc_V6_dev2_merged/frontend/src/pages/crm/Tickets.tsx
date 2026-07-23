/**
 * Tokinarc frontend — src/pages/crm/Tickets.tsx
 * Danh sách service ticket THẬT (GET /crm/tickets/) + KPI nhanh + hành động
 * resolve (POST /crm/tickets/{id}/resolve/).
 * KPI đếm theo trạng thái cần TOÀN BỘ dữ liệu, tách khỏi bảng có phân trang riêng
 * (giống Contracts.tsx) — bảng phân trang không được dùng để đếm KPI.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Ticket as TicketIcon, Check, Plus, PlayCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { fetchAll, fetchPage, PAGE_SIZE } from '@/lib/list'
import {
  TICKET_STATUS_LABEL, TICKET_STATUS_TONE,
  TICKET_PRIORITY_LABEL, TICKET_PRIORITY_TONE,
} from '@/lib/crm'
import type { Ticket } from '@/lib/types'
import {
  PageHeader, StatCard, Tag, Button, TableCard, Th, Td, RowMsg, Pagination,
} from '@/components/ui'
import { TicketForm } from '@/pages/crm/forms/TicketForm'

export function TicketsPage() {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Ticket | null>(null)
  const [page, setPage] = useState(1)
  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (t: Ticket) => { setEditing(t); setFormOpen(true) }

  // KPI đếm theo trạng thái — cần TOÀN BỘ ticket, tách khỏi bảng có phân trang riêng.
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['tickets-all'],
    queryFn: () => fetchAll<Ticket>('/crm/tickets/'),
  })
  const statItems = stats?.items ?? []
  const count = (s: Ticket['status']) => statItems.filter((t) => t.status === s).length

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['tickets', page],
    queryFn: () => fetchPage<Ticket>('/crm/tickets/', { page }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  const inval = () => {
    qc.invalidateQueries({ queryKey: ['tickets'] })
    qc.invalidateQueries({ queryKey: ['tickets-all'] })
    qc.invalidateQueries({ queryKey: ['dash'] })
  }
  const accept = useMutation({
    mutationFn: (id: string) => api.post(`/crm/tickets/${id}/accept/`),
    onSuccess: () => { toast.success('Đã nhận xử lý'); inval() },
    onError: (e) => toast.error(apiError(e)),
  })
  const resolve = useMutation({
    mutationFn: (v: { id: string; resolution: string }) =>
      api.post(`/crm/tickets/${v.id}/resolve/`, { resolution: v.resolution }),
    onSuccess: () => { toast.success('Đã giải quyết — đã báo người tạo'); inval() },
    onError: (e) => toast.error(apiError(e)),
  })
  const onResolve = (id: string) => {
    const resolution = window.prompt('Cách xử lý / kết quả khắc phục:') ?? ''
    if (resolution !== null) resolve.mutate({ id, resolution })
  }

  const items = data?.results ?? []

  return (
    <div className="max-w-6xl">
      <PageHeader
        icon={<TicketIcon size={20} className="text-flame" />}
        title="Service Ticket"
        subtitle={data ? `${data.count} ticket` : undefined}
        actions={<Button onClick={openCreate}><Plus size={14} /> Tạo Ticket</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Mở" tone="blue" value={statsLoading ? '…' : count('open')} />
        <StatCard label="Đang xử lý" tone="warn" value={statsLoading ? '…' : count('in_progress')} />
        <StatCard label="Đã giải quyết" tone="ok" value={statsLoading ? '…' : count('resolved')} />
        <StatCard label="Đóng" tone="gray" value={statsLoading ? '…' : count('closed')} />
      </div>

      <TableCard>
        <thead>
          <tr className="border-b border-line">
            <Th>Mã</Th><Th>Khách hàng</Th><Th>Tiêu đề</Th><Th>Kỹ sư</Th>
            <Th>Ưu tiên</Th><Th>Trạng thái</Th><Th className="text-right">Hành động</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <RowMsg colSpan={7}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={7} danger>Lỗi: {apiError(error)}</RowMsg>}
          {data && items.length === 0 && <RowMsg colSpan={7}>Chưa có ticket nào.</RowMsg>}
          {items.map((t) => (
            <tr key={t.id} onClick={() => openEdit(t)}
              className="border-b border-line/50 last:border-0 hover:bg-ink-3/40 cursor-pointer">
              <Td className="font-mono text-flame">{t.code}</Td>
              <Td className="text-txt-2">{t.customer_name}</Td>
              <Td className="font-medium">{t.title}</Td>
              <Td className="text-txt-2">{t.assignee_name || t.assignee_username || <span className="text-warn">chưa giao</span>}</Td>
              <Td><Tag tone={TICKET_PRIORITY_TONE[t.priority]}>{TICKET_PRIORITY_LABEL[t.priority]}</Tag></Td>
              <Td><Tag tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Tag></Td>
              <Td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                {t.status === 'open' && (
                  <Button variant="ghost" size="sm" className="mr-1"
                    disabled={accept.isPending && accept.variables === t.id}
                    onClick={() => accept.mutate(t.id)}>
                    <PlayCircle size={13} /> Nhận xử lý
                  </Button>
                )}
                {(t.status === 'open' || t.status === 'in_progress') ? (
                  <Button variant="success" size="sm"
                    disabled={resolve.isPending && resolve.variables?.id === t.id}
                    onClick={() => onResolve(t.id)}>
                    <Check size={13} /> Giải quyết
                  </Button>
                ) : (
                  <span className="text-[11px] text-txt-2">—</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      {data && data.count > PAGE_SIZE && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      <TicketForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </div>
  )
}
