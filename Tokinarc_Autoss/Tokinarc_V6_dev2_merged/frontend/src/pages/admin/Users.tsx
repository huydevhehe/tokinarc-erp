/**
 * Tokinarc frontend — src/pages/admin/Users.tsx
 * Quản trị người dùng (chỉ admin/superuser). Dùng API có sẵn:
 *   GET    /accounts/users/                list (chỉ is_active=true — xem apps/accounts/views.py)
 *   POST   /accounts/users/                tạo
 *   PATCH  /accounts/users/{id}/           sửa / "xóa" (is_active=false — đổi trạng thái,
 *                                          KHÔNG xóa row, chỉ ẩn khỏi danh sách này)
 *   POST   /accounts/users/{id}/set-role/  đổi role (ghi AuditLog)
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { UserCog, Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiError } from '@/lib/api'
import { fetchPage, PAGE_SIZE } from '@/lib/list'
import { useAuth } from '@/lib/auth/store'
import type { User, Role } from '@/lib/types'
import {
  PageHeader, Button, TableCard, Th, Td, RowMsg, Pagination,
} from '@/components/ui'
import { UserForm } from '@/pages/admin/UserForm'

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'customer', label: 'Khách hàng' },
  { value: 'sales', label: 'Sales' },
  { value: 'warehouse', label: 'Nhân viên kho' },
  { value: 'wh_manager', label: 'Quản lý kho' },
  { value: 'service', label: 'Kỹ sư dịch vụ' },
  { value: 'manager', label: 'Quản lý' },
  { value: 'ceo', label: 'CEO' },
  { value: 'admin', label: 'Admin' },
]
const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]))

export function AdminUsersPage() {
  const qc = useQueryClient()
  const meId = useAuth((s) => s.user?.id)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['admin-users', page, pageSize],
    queryFn: () => fetchPage<User>('/accounts/users/', { page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] })

  const setRole = useMutation({
    mutationFn: (v: { id: string; role: Role }) =>
      api.post(`/accounts/users/${v.id}/set-role/`, { role: v.role }),
    onSuccess: () => { toast.success('Đã đổi vai trò'); invalidate() },
    onError: (e) => toast.error(apiError(e)),
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => api.patch(`/accounts/users/${id}/`, { is_active: false }),
    onSuccess: () => { toast.success('Đã xoá tài khoản'); invalidate() },
    onError: (e) => toast.error(apiError(e)),
  })

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (u: User) => { setEditing(u); setFormOpen(true) }

  const users = data?.results ?? []

  return (
    <div className="max-w-5xl">
      <PageHeader
        icon={<UserCog size={20} className="text-flame" />}
        title="Người dùng & quyền"
        subtitle={data ? `${data.count} tài khoản` : 'Quản trị tài khoản và phân quyền'}
        actions={<Button onClick={openCreate}><Plus size={14} /> Tạo người dùng</Button>}
      />

      <TableCard>
        <thead>
          <tr className="border-b border-line">
            <Th>Tài khoản</Th><Th>Họ tên</Th><Th>Email</Th>
            <Th>Vai trò</Th><Th className="text-right">Hành động</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <RowMsg colSpan={5}>Đang tải…</RowMsg>}
          {isError && <RowMsg colSpan={5} danger>Lỗi: {apiError(error)}</RowMsg>}
          {users.length === 0 && !isLoading && <RowMsg colSpan={5}>Chưa có tài khoản nào.</RowMsg>}
          {users.map((u) => {
            const isSelf = u.id === meId
            return (
              <tr key={u.id} className="border-b border-line/50 last:border-0 hover:bg-ink-3/40">
                <Td className="font-mono">{u.username}{isSelf && <span className="text-txt-2"> (bạn)</span>}</Td>
                <Td className="font-medium">{u.full_name || u.display_name || '—'}</Td>
                <Td className="text-txt-2">{u.email || '—'}</Td>
                <Td>
                  <select
                    value={u.role}
                    disabled={isSelf || setRole.isPending}
                    onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as Role })}
                    className="bg-ink-3 border border-line rounded-md px-2 py-1 text-xs focus:outline-none focus:border-flame disabled:opacity-60"
                    title={isSelf ? 'Không thể tự đổi vai trò của mình' : 'Đổi vai trò'}
                  >
                    {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Td>
                <Td className="text-right">
                  <span className="inline-flex gap-1.5 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      <Pencil size={13} /> Sửa
                    </Button>
                    <Button variant="ghost" size="sm" disabled={isSelf || deactivate.isPending}
                      title={isSelf ? 'Không thể tự xoá tài khoản của mình' : 'Xoá tài khoản'}
                      className="!text-danger"
                      onClick={() => {
                        if (isSelf) return
                        if (confirm(`Xoá tài khoản "${u.username}"? Tài khoản sẽ ngừng hoạt động (dữ liệu cũ vẫn giữ nguyên).`)) {
                          deactivate.mutate(u.id)
                        }
                      }}>
                      <Trash2 size={13} /> Xoá
                    </Button>
                  </span>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </TableCard>

      {data && data.count > 0 && (
        <Pagination page={page} totalPages={totalPages} fetching={isFetching}
          pageSize={pageSize} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
          onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      <UserForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </div>
  )
}

export { ROLE_LABEL }
