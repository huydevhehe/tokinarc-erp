/**
 * Tokinarc frontend — src/lib/auth/capabilities.ts
 * Giai đoạn 1 hệ thống phân quyền function-based — đọc capability ĐỘNG từ
 * GET /accounts/me/capabilities/ (thay vì hardcode role như isManager/isCeo).
 * Chỉ áp dụng cho action đã "wire" vào engine (xem backend capabilities.py) —
 * các quyền khác vẫn dùng isManager/isCeo/isWmsControl như cũ.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth/store'

export function useCapabilities() {
  const userId = useAuth((s) => s.user?.id)
  const isAuthed = useAuth((s) => s.isAuthed)
  return useQuery({
    queryKey: ['my-capabilities', userId],
    queryFn: async () => (await api.get<{ capabilities: string[] }>('/accounts/me/capabilities/')).data.capabilities,
    enabled: isAuthed,
    staleTime: 60_000,
  })
}

/** True nếu role hiện tại được cấp capability `key` (mặc định false khi chưa tải xong). */
export function useCan(key: string): boolean {
  const { data } = useCapabilities()
  return !!data?.includes(key)
}
