/**
 * Tokinarc frontend — src/pages/crm/forms/TicketForm.tsx
 * Modal tạo/sửa service ticket. POST /crm/tickets/ hoặc PATCH .../{id}/.
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ticket as TicketIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { TICKET_STATUS_LABEL, TICKET_PRIORITY_LABEL, formatDate } from '@/lib/crm'
import { useCustomerOptions, optionsFromLabels } from '@/lib/useCustomerOptions'
import type { Ticket } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { FieldRow, TextInput, TextArea, SelectInput } from '@/components/form'

interface Form {
  customer: string; title: string; description: string
  status: string; priority: string; serial_no: string; assignee: string
}

const EMPTY: Form = {
  customer: '', title: '', description: '',
  status: 'open', priority: 'medium', serial_no: '', assignee: '',
}

export function TicketForm({ open, onClose, editing }: {
  open: boolean; onClose: () => void; editing?: Ticket | null
}) {
  const qc = useQueryClient()
  const { options: customers, isLoading: custLoading } = useCustomerOptions()
  const engineers = useQuery({
    queryKey: ['engineers'],
    queryFn: async () => (await api.get<{ id: string; name: string; role: string }[]>('/accounts/engineers/')).data,
    enabled: open,
  })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return
    reset(editing ? {
      customer: editing.customer, title: editing.title, description: editing.description,
      status: editing.status, priority: editing.priority, serial_no: editing.serial_no,
      assignee: editing.assignee ?? '',
    } : EMPTY)
  }, [open, editing, reset])

  const save = useMutation({
    mutationFn: (data: Form) => {
      const payload = { ...data, assignee: data.assignee || null }
      return editing
        ? api.patch(`/crm/tickets/${editing.id}/`, payload)
        : api.post('/crm/tickets/', payload)
    },
    onSuccess: (res) => {
      // Khách báo lại cùng máy (cùng serial_no + KH) → BE tự mở lại ticket cũ
      // thay vì tạo mã mới (#9 biên bản) — báo rõ để không tưởng nhầm là tạo mới.
      if (!editing && res.data?.merged_into_existing) {
        toast.success(`Đã gộp vào ticket cũ ${res.data.code} (khách báo lại cùng máy) — không tạo mã mới`)
      } else {
        toast.success(editing ? 'Đã cập nhật ticket' : 'Đã tạo ticket')
      }
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['dash'] })
      onClose()
    },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <Modal
      open={open} onClose={onClose}
      title={editing ? `Sửa ticket — ${editing.code}` : 'Tạo Ticket'}
      icon={<TicketIcon size={18} className="text-flame" />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit((d) => save.mutate(d))} disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : editing ? 'Lưu' : 'Tạo'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((d) => save.mutate(d))}>
        <SelectInput
          label="Khách hàng *" full error={errors.customer?.message}
          placeholder={custLoading ? 'Đang tải KH…' : '— Chọn khách hàng —'}
          options={customers}
          {...register('customer', { required: 'Chọn khách hàng' })}
        />
        <TextInput label="Tiêu đề *" full error={errors.title?.message}
          {...register('title', { required: 'Bắt buộc' })} />
        <FieldRow>
          <SelectInput label="Mức ưu tiên" options={optionsFromLabels(TICKET_PRIORITY_LABEL)} {...register('priority')} />
          <SelectInput label="Trạng thái" options={optionsFromLabels(TICKET_STATUS_LABEL)} {...register('status')} />
        </FieldRow>
        <FieldRow>
          <TextInput label="Serial sản phẩm" {...register('serial_no')} />
          <SelectInput label="Giao kỹ sư" placeholder="— Chưa giao —"
            options={(engineers.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
            {...register('assignee')} />
        </FieldRow>
        <TextArea label="Mô tả" {...register('description')} />
      </form>

      {editing && !!editing.resolution_logs?.length && (
        <div className="mt-4 pt-3 border-t border-line">
          <div className="text-[11px] uppercase tracking-wide text-txt-2 font-semibold mb-2">
            Lịch sử xử lý ({editing.resolution_logs.length} lần)
          </div>
          <ul className="space-y-2">
            {editing.resolution_logs.map((log) => (
              <li key={log.id} className="text-sm bg-ink-3 rounded-md px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-txt-2 mb-0.5">
                  <span>Lần {log.attempt_no} — {log.resolved_by_username || 'không rõ'}</span>
                  <span>{formatDate(log.resolved_at)}</span>
                </div>
                <div className="whitespace-pre-wrap">{log.content}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
