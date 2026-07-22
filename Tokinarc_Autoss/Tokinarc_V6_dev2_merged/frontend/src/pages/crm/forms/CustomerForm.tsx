/**
 * Tokinarc frontend — src/pages/crm/forms/CustomerForm.tsx
 * Modal tạo/sửa Khách hàng. POST /crm/customers/ hoặc PATCH /crm/customers/{id}/.
 * (owner do backend tự gán; code phải bắt đầu 'KH-'.)
 */
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { Building2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { SEGMENT_LABEL, CUSTOMER_STATUS_LABEL } from '@/lib/crm'
import { optionsFromLabels } from '@/lib/useCustomerOptions'
import type { Customer, CustomerDetail } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'
import { FieldRow, TextInput, TextArea, SelectInput } from '@/components/form'

interface Form {
  code: string; name: string; tax_code: string
  segment: string; region: string; status: string; notes: string
}

const EMPTY: Form = {
  code: '', name: '', tax_code: '', segment: 'factory', region: '', status: 'new', notes: '',
}

interface DupMatch { id: string; code: string; name: string }

export function CustomerForm({ open, onClose, editing, onSaved }: {
  open: boolean
  onClose: () => void
  editing?: Customer | CustomerDetail | null
  onSaved?: () => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ defaultValues: EMPTY })
  const [dupMatches, setDupMatches] = useState<DupMatch[] | null>(null)

  useEffect(() => {
    if (!open) return
    setDupMatches(null)
    reset(editing ? {
      code: editing.code, name: editing.name, tax_code: editing.tax_code,
      segment: editing.segment, region: editing.region, status: editing.status,
      notes: (editing as CustomerDetail).notes ?? '',
    } : EMPTY)
  }, [open, editing, reset])

  const save = useMutation({
    mutationFn: (data: Form) => editing
      ? api.patch(`/crm/customers/${editing.id}/`, data)
      : api.post('/crm/customers/', data),
    onSuccess: () => {
      toast.success(editing ? 'Đã cập nhật khách hàng' : 'Đã tạo khách hàng')
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer-options'] })
      qc.invalidateQueries({ queryKey: ['customer-360'] })
      qc.invalidateQueries({ queryKey: ['dash'] })
      onSaved?.()
      onClose()
    },
    onError: (e) => {
      const data = (e as AxiosError<{ code?: string; matches?: DupMatch[] }>).response?.data
      if (data?.code === 'POSSIBLE_DUPLICATE') {
        setDupMatches(data.matches ?? [])
      } else {
        setDupMatches(null)
      }
      toast.error(apiError(e))
    },
  })

  return (
    <Modal
      open={open} onClose={onClose}
      title={editing ? `Sửa KH — ${editing.name}` : 'Thêm khách hàng'}
      icon={<Building2 size={18} className="text-flame" />}
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
        <FieldRow>
          <TextInput label="Mã KH *" placeholder="KH-0001" error={errors.code?.message}
            disabled={!!editing}
            {...register('code', {
              required: 'Bắt buộc',
              pattern: { value: /^KH-/, message: "Mã phải bắt đầu bằng 'KH-'" },
            })} />
          <TextInput label="Mã số thuế" {...register('tax_code')} />
        </FieldRow>
        <TextInput label="Tên công ty *" full error={errors.name?.message}
          {...register('name', { required: 'Bắt buộc' })} />
        <FieldRow>
          <SelectInput label="Phân khúc" options={optionsFromLabels(SEGMENT_LABEL)} {...register('segment')} />
          <SelectInput label="Trạng thái" options={optionsFromLabels(CUSTOMER_STATUS_LABEL)} {...register('status')} />
        </FieldRow>
        <FieldRow>
          <TextInput label="Vùng" placeholder="HCM / Hà Nội / Đồng Nai…" {...register('region')} />
          <div />
        </FieldRow>
        <TextArea label="Ghi chú" {...register('notes')} />

        {dupMatches && dupMatches.length > 0 && (
          <div className="bg-danger/10 border border-danger/30 rounded-md px-3 py-2 mt-1">
            <p className="text-sm text-danger font-medium flex items-center gap-1.5">
              <AlertTriangle size={14} /> Có thể trùng với khách hàng đã có:
            </p>
            <ul className="text-sm mt-1 space-y-0.5">
              {dupMatches.map((m) => (
                <li key={m.id}><span className="font-mono text-flame">{m.code}</span> — {m.name}</li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  )
}
