/**
 * Tokinarc frontend — src/pages/admin/CapabilityMatrix.tsx
 * Ma trận phân quyền function-based (Giai đoạn 1) — admin/CEO tick/bỏ tick
 * "role X được làm hành động Y" mà không cần dev sửa code.
 *   GET/PATCH /accounts/capabilities/
 */
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { PageHeader, TableCard, Th, Td, RowMsg } from '@/components/ui'
import { ROLE_LABEL } from '@/pages/admin/Users'
import type { Role } from '@/lib/types'

interface GrantRow {
  role: Role; capability_key: string; label: string; group: string; is_granted: boolean
}

// Cùng thứ tự cột với ROLE_OPTIONS ở Users.tsx.
const ROLES: Role[] = ['sales', 'warehouse', 'wh_manager', 'service', 'manager', 'ceo', 'admin']

export function CapabilityMatrixPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['capability-matrix'],
    queryFn: async () => (await api.get<GrantRow[]>('/accounts/capabilities/')).data,
  })

  const toggle = useMutation({
    mutationFn: (v: { role: Role; capability_key: string; is_granted: boolean }) =>
      api.patch('/accounts/capabilities/', v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capability-matrix'] }),
    onError: (e) => toast.error(apiError(e)),
  })

  // Gom theo capability_key → 1 dòng, mỗi role 1 cột.
  const rows = useMemo(() => {
    if (!data) return []
    const byKey = new Map<string, { label: string; group: string; grants: Map<Role, boolean> }>()
    for (const g of data) {
      if (!byKey.has(g.capability_key)) {
        byKey.set(g.capability_key, { label: g.label, group: g.group, grants: new Map() })
      }
      byKey.get(g.capability_key)!.grants.set(g.role, g.is_granted)
    }
    return [...byKey.entries()].map(([key, v]) => ({ key, ...v }))
  }, [data])

  return (
    <div className="max-w-6xl">
      <PageHeader
        icon={<ShieldCheck size={20} className="text-flame" />}
        title="Phân quyền theo chức năng"
        subtitle="Tick/bỏ tick để đổi ngay — không cần sửa code. Đã bao phủ các hành động duyệt/xoá/xuất hoá đơn và phạm vi xem dữ liệu (của mình/tất cả); một số điểm khác vẫn theo role cố định."
      />

      <TableCard>
        <thead>
          <tr className="border-b border-line">
            <Th>Nhóm</Th><Th>Hành động</Th>
            {ROLES.map((r) => <Th key={r} className="text-center">{ROLE_LABEL[r]}</Th>)}
          </tr>
        </thead>
        <tbody>
          {isLoading && <RowMsg colSpan={2 + ROLES.length}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={2 + ROLES.length} danger>Lỗi: {apiError(error)}</RowMsg>}
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
              <Td className="text-txt-2 text-xs">{row.group}</Td>
              <Td className="font-medium">{row.label}</Td>
              {ROLES.map((r) => (
                <Td key={r} className="text-center">
                  <input
                    type="checkbox"
                    checked={row.grants.get(r) ?? false}
                    disabled={toggle.isPending}
                    onChange={(e) => toggle.mutate({
                      role: r, capability_key: row.key, is_granted: e.target.checked,
                    })}
                    className="w-4 h-4 accent-flame cursor-pointer"
                  />
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  )
}
